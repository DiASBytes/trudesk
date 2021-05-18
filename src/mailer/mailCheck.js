/*
 *       .                             .o8                     oooo
 *    .o8                             "888                     `888
 *  .o888oo oooo d8b oooo  oooo   .oooo888   .ooooo.   .oooo.o  888  oooo
 *    888   `888""8P `888  `888  d88' `888  d88' `88b d88(  "8  888 .8P'
 *    888    888      888   888  888   888  888ooo888 `"Y88b.   888888.
 *    888 .  888      888   888  888   888  888    .o o.  )88b  888 `88b.
 *    "888" d888b     `V88V"V8P' `Y8bod88P" `Y8bod8P' 8""888P' o888o o888o
 *  ========================================================================
 *  Author:     Chris Brame
 *  Updated:    1/20/19 4:43 PM
 *  Copyright (c) 2014-2019. All rights reserved.
 */

var _ = require('lodash')
var async = require('async')
var Imap = require('imap')
var winston = require('winston')
// var marked      = require('marked');
var simpleParser = require('mailparser').simpleParser
var cheerio = require('cheerio')
var planer = require('planer')

var fs = require('fs');
var base64 = require('base64-stream')
var path = require('path');

var emitter = require('../emitter')
var userSchema = require('../models/user')
var groupSchema = require('../models/group')
var ticketTypeSchema = require('../models/tickettype')
var Ticket = require('../models/ticket')

var mailJet = require('./mailJet')

var mailCheck = {}
mailCheck.inbox = []
mailCheck.attachments = []

mailCheck.init = function (settings) {
    var s = {}
    s.mailerCheckEnabled = _.find(settings, function (x) {
        return x.name === 'mailer:check:enable'
    })
    s.mailerCheckHost = _.find(settings, function (x) {
        return x.name === 'mailer:check:host'
    })
    s.mailerCheckPort = _.find(settings, function (x) {
        return x.name === 'mailer:check:port'
    })
    s.mailerCheckUsername = _.find(settings, function (x) {
        return x.name === 'mailer:check:username'
    })
    s.mailerCheckPassword = _.find(settings, function (x) {
        return x.name === 'mailer:check:password'
    })
    s.mailerCheckPolling = _.find(settings, function (x) {
        return x.name === 'mailer:check:polling'
    })
    s.mailerCheckTicketType = _.find(settings, function (x) {
        return x.name === 'mailer:check:ticketype'
    })
    s.mailerCheckTicketPriority = _.find(settings, function (x) {
        return x.name === 'mailer:check:ticketpriority'
    })
    s.mailerCheckCreateAccount = _.find(settings, function (x) {
        return x.name === 'mailer:check:createaccount'
    })
    s.mailerCheckDeleteMessage = _.find(settings, function (x) {
        return x.name === 'mailer:check:deletemessage'
    })

    s.mailerCheckEnabled = s.mailerCheckEnabled === undefined ? { value: false } : s.mailerCheckEnabled
    s.mailerCheckHost = s.mailerCheckHost === undefined ? { value: '' } : s.mailerCheckHost
    s.mailerCheckPort = s.mailerCheckPort === undefined ? { value: 143 } : s.mailerCheckPort
    s.mailerCheckUsername = s.mailerCheckUsername === undefined ? { value: '' } : s.mailerCheckUsername
    s.mailerCheckPassword = s.mailerCheckPassword === undefined ? { value: '' } : s.mailerCheckPassword
    s.mailerCheckPolling = s.mailerCheckPolling === undefined ? { value: 600000 } : s.mailerCheckPolling // 10 min
    s.mailerCheckTicketType = s.mailerCheckTicketType === undefined ? { value: 'Issue' } : s.mailerCheckTicketType
    s.mailerCheckTicketPriority = s.mailerCheckTicketPriority === undefined ? { value: '' } : s.mailerCheckTicketPriority
    s.mailerCheckCreateAccount = s.mailerCheckCreateAccount === undefined ? { value: false } : s.mailerCheckCreateAccount
    s.mailerCheckDeleteMessage = s.mailerCheckDeleteMessage === undefined ? { value: false } : s.mailerCheckDeleteMessage

    var MAILERCHECK_ENABLED = s.mailerCheckEnabled.value
    var MAILERCHECK_HOST = s.mailerCheckHost.value
    var MAILERCHECK_USER = s.mailerCheckUsername.value
    var MAILERCHECK_PASS = s.mailerCheckPassword.value
    var MAILERCHECK_PORT = s.mailerCheckPort.value
    var MAILERCHECK_TLS = s.mailerCheckPort.value === '993' ? { value: true } : false
    var POLLING_INTERVAL = s.mailerCheckPolling.value

    if (!MAILERCHECK_ENABLED) return true

    mailCheck.Imap = new Imap({
        user: MAILERCHECK_USER,
        password: MAILERCHECK_PASS,
        host: MAILERCHECK_HOST,
        port: MAILERCHECK_PORT,
        tls: MAILERCHECK_TLS
    })

    mailCheck.fetchMailOptions = {
        defaultTicketType: s.mailerCheckTicketType.value,
        defaultPriority: s.mailerCheckTicketPriority.value,
        createAccount: s.mailerCheckCreateAccount.value,
        deleteMessage: s.mailerCheckDeleteMessage.value
    }

    mailCheck.messages = []

    bindImapError()
    bindImapReady()

    mailCheck.fetchMail()
    mailCheck.checkTimer = setInterval(function () {
        mailCheck.fetchMail()
    }, POLLING_INTERVAL)
}

mailCheck.refetch = function () {
    if (_.isUndefined(mailCheck.fetchMailOptions)) {
        winston.warn('Mailcheck.refetch() running before Mailcheck.init(); please run Mailcheck.init() prior')
        return
    }

    mailCheck.fetchMail()
}

function bindImapError() {
    mailCheck.Imap.on('error', function (err) {
        winston.debug(err)
    })
}

function onImapReady() {
    setTimeout(() => {
        handleMessages(mailCheck.messages);
    }, 5000);

    mailCheck.Imap.destroy();
}

function randomFilename() { return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15); }

function safeFilename(filename) { return filename.replace(/[^a-z0-9]/gi, '-').toLowerCase() }

function toUpper(thing) { return thing && thing.toUpperCase ? thing.toUpperCase() : thing; }

function findAttachmentParts(struct, attachments) {
    attachments = attachments || []

    struct.forEach((i) => {
        if (Array.isArray(i)) {
            findAttachmentParts(i, attachments)
        } else if (i.disposition && ['INLINE', 'ATTACHMENT'].indexOf(toUpper(i.disposition.type)) > -1) {
            attachments.push(i)
        } else if (i.params && i.params.name) {
            attachments.push(i)
        }
    })

    return attachments
}

function buildAttMessageFunction(attachment, sqNumber) {
    var ext = attachment.subtype;
    var name = randomFilename();

    if (attachment.params && attachment.params.name && attachment.params.name.indexOf('.') > -1) {
        var tmp = attachment.params.name.split('.');
        ext = tmp.pop();
        name = safeFilename(tmp.join(''));
    }

    var filename = name + '-' + new Date().valueOf() + '.' + ext;
    var encoding = attachment.encoding;

    return function (msg) {
        if (attachment.size < 5000) {
            winston.debug('Skipping attachment: size < 5KB');
            return;
        }

        msg.on('body', function (stream) {
            if (!fs.existsSync('./public/uploads/tmp/'))
                fs.mkdirSync('./public/uploads/tmp/');

            var writeStream = fs.createWriteStream('./public/uploads/tmp/' + filename);

            writeStream.on('finish', function () {
                winston.debug(`Added attachment: ${filename}`);

                mailCheck.attachments.push({
                    sqNumber: sqNumber,
                    filename: filename,
                    path: `./public/uploads/tmp/${filename}`
                });
            });

            writeStream.on('error', err => console.log('Error writeStream attachment %s', err.message))

            if (toUpper(encoding) === 'BASE64') {
                stream.pipe(new base64.Base64Decode()).pipe(writeStream);
            } else {
                stream.pipe(writeStream);
            }
        });

        msg.once('end', function () {
            console.log('Finished attachment %s', filename);
        });
    };
}

function bindImapReady() {
    try {
        mailCheck.Imap.on('ready', function () {
            openInbox(function (err) {
                if (err) {
                    onImapReady();
                    winston.debug(err)
                } else {
                    async.waterfall(
                        [
                            function (next) {
                                mailCheck.Imap.search(['UNSEEN'], next)
                            },
                            function (results, next) {
                                if (_.size(results) < 1) {
                                    winston.info('MailCheck: Nothing to Fetch.')
                                    return next()
                                }

                                winston.debug(`Processing ${_.size(results)} Mail > Ticket`)

                                var flag = '\\Seen'
                                if (mailCheck.fetchMailOptions.deleteMessage) {
                                    flag = '\\Deleted'
                                }

                                mailCheck.Imap.addFlags(results, flag, function (err) {
                                    if (err) winston.warn(err)
                                })

                                var message = {}

                                var f = mailCheck.Imap.fetch(results, {
                                    bodies: '',
                                    struct: true
                                })

                                f.on('message', function (msg, sqNumber) {
                                    msg.on('body', function (stream) {
                                        var buffer = ''

                                        stream.on('data', function (chunk) {
                                            buffer += chunk.toString('utf8')
                                        })

                                        stream.once('end', function () {
                                            simpleParser(buffer, function (err, mail) {
                                                if (err) {
                                                    winston.error(err);
                                                }

                                                winston.debug(`Parsing: ${mail.subject}`);

                                                if (sqNumber) {
                                                    message.sqNumber = sqNumber
                                                }

                                                if (mail.headers.has('from')) {
                                                    message.from = mail.headers.get('from').value[0].address
                                                }

                                                if (mail.subject) {
                                                    message.subject = mail.subject
                                                } else {
                                                    message.subject = message.from
                                                }

                                                var $ = cheerio.load(mail.html ? mail.html : mail.textAsHtml)
                                                var $body = $('body')
                                                var $supportDivider = $('#support-divider')

                                                if($supportDivider) {
                                                    var $updateMail = $supportDivider.parent().parents().eq(15)
                                                    $updateMail.nextAll().remove()
                                                    $updateMail.remove()

                                                    var htmlString = $body.html();
                                                    var outlookString = '<div><div style="border:none;border-top:solid #E1E1E1 1.0pt';

                                                    if(htmlString.includes(outlookString)) {
                                                        const stringIndex = htmlString.indexOf(outlookString);
                                                        message.htmlAfterDivider = htmlString.substring(0, stringIndex) + '</div>';
                                                    } else {
                                                        message.htmlAfterDivider = $body.html()
                                                    }
                                                }

                                                if (_.isUndefined(mail.textAsHtml)) {
                                                    message.body = $body.length > 0 ? $body.html() : mail.html
                                                } else {
                                                    message.body = mail.textAsHtml
                                                }

                                                message.bodyTxt = mail.text

                                                // Check if email is a reply
                                                var isReply = mail.subject.match(/#[1-9]\d*\b/g);
                                                if (isReply) {
                                                    const replyUid = isReply[0].substr(1);
                                                    winston.debug(`New email reply: ${replyUid}`);
                                                    message.replyUid = replyUid;
                                                } else {
                                                    message.replyUid = undefined;
                                                }

                                                const clonedMsg = _.clone(message);
                                                mailCheck.messages.push(clonedMsg);
                                                
                                                winston.debug('Message', { msg });
                                            })
                                        })

                                        msg.once('attributes', function (attrs) {
                                            var attachments = findAttachmentParts(attrs.struct);

                                            for (var i = 0; i < attachments.length; i++) {
                                                var attachment = attachments[i];

                                                var af = mailCheck.Imap.fetch(attrs.uid, {
                                                    bodies: [attachment.partID],
                                                    struct: true
                                                });

                                                af.on('message', buildAttMessageFunction(attachment, sqNumber));
                                            }
                                        });
                                    })
                                })

                                f.on('end', function () {
                                    mailCheck.Imap.closeBox(true, function (err) {
                                        if (err) winston.warn(err)

                                        return next()
                                    })
                                })
                            }
                        ],
                        function (err) {
                            if (err) {
                                winston.error(err);
                            }
                            onImapReady();
                        }
                    )
                }
            })
        })
    } catch (error) {
        winston.error(error);
        onImapReady();
    }
}

mailCheck.fetchMail = function () {
    try {
        mailCheck.messages = []
        mailCheck.Imap.connect()
    } catch (err) {
        mailCheck.Imap.end()
        winston.warn(err)
    }
}

function handleMessages(messages) {
    messages.forEach(function (message) {
        winston.debug('Handling message', message);
        if (
            !_.isUndefined(message.from) &&
            !_.isEmpty(message.from) &&
            !_.isUndefined(message.subject) &&
            !_.isEmpty(message.subject) &&
            !_.isUndefined(message.body) &&
            !_.isEmpty(message.body)
        ) {
            async.auto(
                {
                    handleReply: function (callback) {
                        if (message.replyUid) {
                            winston.debug('Message is reply');
                            Ticket.getTicketByUid(message.replyUid, (err, t) => {
                                if (!err && t && !t.deleted) {
                                    winston.debug('Reply email ticket found');

                                    const reply = planer.extractFrom(message.body, 'text/plain');
                                    message.reply = reply;

                                    if(reply.endsWith('&gt;')) {
                                        message.reply = reply.substring(0, reply.length - 4)
                                    }
                                    
                                    // check for content from ticket update mail
                                    if(reply.includes("Rijksweg 53 | 9681 Maarkedal | +32 55 27 09 99")) {
                                        message.reply = message.htmlAfterDivider;
                                    }

                                    message.ticket = t;
                                    callback(null, t);
                                } else {
                                    winston.debug("Reply email ticket not found");
                                    message.reply = undefined;
                                    message.replyUid = undefined;
                                    callback(null);
                                }
                            });
                        } else {
                            callback(null);
                        }
                    },
                    handleUser: [
                        'handleReply',
                        function (results, callback) {
                            userSchema.getUserByEmail(message.from, (err, user) => {
                                if (err) winston.error(err)
                                if (!err && user && !message.reply) {
                                    message.owner = user
                                    return callback(null, user)
                                } else if (!err && user && message.reply) {
                                    message.replyUser = user;
                                    return callback(null, user);
                                }

                                // User doesn't exist. Lets create public user... If we want to
                                if (mailCheck.fetchMailOptions.createAccount) {
                                    winston.debug(`No user found: creating ${message.from}`);
                                    userSchema.createUserFromEmail(message.from, message.from, function (err, response) {
                                        if (err) {
                                            winston.error(err);
                                            return callback(err)
                                        }

                                        if (!message.reply) {
                                            message.owner = response.user
                                            message.group = response.group
                                        } else {
                                            message.replyUser = response.user;
                                            message.replyUserGroup = response.group;
                                        }

                                        return callback(null, response)
                                    })
                                } else {
                                    return callback('No User found.')
                                }
                            })
                        }
                    ],
                    handleGroup: [
                        'handleUser',
                        function (results, callback) {
                            if (!_.isUndefined(message.group) || message.reply) {
                                return callback()
                            }

                            groupSchema.getAllGroupsOfUser(message.owner._id, function (err, group) {
                                if (err) {
                                    winston.error(err);
                                    return callback(err)
                                }
                                if (!group) return callback('Unknown group for user: ' + message.owner.email)

                                if (_.isArray(group)) {
                                    message.group = _.first(group)
                                } else {
                                    message.group = group
                                }

                                return callback(null, group)
                            })
                        }
                    ],
                    handleTicketType: function (callback) {
                        if (mailCheck.fetchMailOptions.defaultTicketType === 'Issue') {
                            ticketTypeSchema.getTypeByName('Issue', function (err, type) {
                                if (err) return callback(err)

                                mailCheck.fetchMailOptions.defaultTicketType = type._id
                                message.type = type

                                return callback(null, type)
                            })
                        } else {
                            ticketTypeSchema.getType(mailCheck.fetchMailOptions.defaultTicketType, function (err, type) {
                                if (err) return callback(err)

                                message.type = type

                                return callback(null, type)
                            })
                        }
                    },
                    handlePriority: [
                        'handleTicketType',
                        function (result, callback) {
                            var type = result.handleTicketType

                            if (mailCheck.fetchMailOptions.defaultPriority !== '') {
                                return callback(null, mailCheck.fetchMailOptions.defaultPriority)
                            }

                            var firstPriority = _.first(type.priorities)
                            if (!_.isUndefined(firstPriority)) {
                                mailCheck.fetchMailOptions.defaultPriority = firstPriority._id
                            } else {
                                return callback('Invalid default priority')
                            }

                            return callback(null, firstPriority._id)
                        }
                    ],
                    handleCreateTicket: [
                        'handleGroup',
                        'handlePriority',
                        function (results, callback) {
                            if (!message.reply || !message.ticket) {
                                winston.debug(`Creating ticket`, {
                                    subject: message.subject,
                                    owner: message.owner,
                                    group: message.group
                                });
                                var HistoryItem = {
                                    action: 'ticket:created',
                                    description: 'Ticket was created.',
                                    owner: message.owner._id
                                }

                                Ticket.create(
                                    {
                                        owner: message.owner._id,
                                        group: message.group._id,
                                        type: message.type._id,
                                        status: 0,
                                        priority: results.handlePriority,
                                        subject: message.subject,
                                        issue: message.body,
                                        history: [HistoryItem],
                                        subscribers: [message.owner._id],
                                        needsAttention: !message.owner.email.includes('diasbytes.com'),
                                        origin: 'Mail'
                                    },
                                    function (err, ticket) {
                                        if (err) {
                                            winston.error(err);
                                            return callback(err)
                                        }

                                        emitter.emit('ticket:created', {
                                            socketId: '',
                                            ticket: ticket
                                        })

                                        var messageAttachments = mailCheck.attachments.filter((a) => a.sqNumber === message.sqNumber);

                                        if (messageAttachments && messageAttachments.length > 0) {
                                            winston.debug(`Message has attachments`);
                                            const attachments = [];

                                            const publicPath = path.join(__dirname, '../../public/');

                                            if (!fs.existsSync(`${publicPath}uploads/tickets/${ticket._id}`))
                                                fs.mkdirSync(`${publicPath}uploads/tickets/${ticket._id}`);

                                            for (var i = 0; i < messageAttachments.length; i++) {
                                                try {
                                                    fs.renameSync(messageAttachments[i].path, `${publicPath}uploads/tickets/${ticket._id}/${messageAttachments[i].filename}`);
                                                    var ext = messageAttachments[i].path.split('.').pop().toLowerCase();
                                                    var isImage = ext === "jpg" || ext === "png" || ext === "jpeg";
                                                    attachments.push({
                                                        owner: message.owner._id,
                                                        name: messageAttachments[i].filename,
                                                        date: new Date(),
                                                        path: `/uploads/tickets/${ticket._id}/${messageAttachments[i].filename}`,
                                                        type: isImage ? 'image' : `.${ext}`
                                                    })
                                                } catch (e) {
                                                    winston.error(e);
                                                }
                                            }

                                            ticket.addAttachments(ticket._id, attachments, function () {
                                                ticket.save(function (err, t) {
                                                    if (err) {
                                                        winston.debug("Adding attachments failed!");
                                                    } else {
                                                        callback();
                                                    }
                                                });
                                            });
                                        }
                                    }
                                )
                            } else {
                                message.ticket.addComment(message.replyUser, message.reply, function () {
                                    winston.debug(`Adding comment to ticket ${message.ticket.uid}`);

                                    message.ticket.needsAttention = !message.replyUser.email.includes('diasbytes.com');

                                    message.ticket.save(function (err, ticket) {
                                        if (err) {
                                            winston.error(err);
                                            return;
                                        }

                                        if(ticket.assignee) {
                                            mailJet.sendTicketUpdateAssignee(ticket, ticket.assignee);
                                        }

                                        var messageAttachments = mailCheck.attachments.filter((a) => a.sqNumber === message.sqNumber);

                                        if (messageAttachments && messageAttachments.length > 0) {
                                            const attachments = [];

                                            const publicPath = path.join(__dirname, '../../public/');

                                            if (!fs.existsSync(`${publicPath}uploads/tickets/${ticket._id}`))
                                                fs.mkdirSync(`${publicPath}uploads/tickets/${ticket._id}`);

                                            for (var i = 0; i < messageAttachments.length; i++) {
                                                fs.rename(messageAttachments[i].path, `${publicPath}uploads/tickets/${ticket._id}/${messageAttachments[i].filename}`, function (err) {
                                                    if (err)
                                                        throw err
                                                })

                                                attachments.push({
                                                    owner: message.replyUser.id,
                                                    name: messageAttachments[i].filename,
                                                    date: new Date(),
                                                    path: `/uploads/tickets/${ticket._id}/${messageAttachments[i].filename}`,
                                                    type: 'image'
                                                })

                                                if (attachments.length === messageAttachments.length) {
                                                    ticket.addAttachmentsToComment(ticket._id, attachments, function () {
                                                        ticket.save(function (err, t) {
                                                            if (err) {
                                                                winston.debug("Adding attachments failed!");
                                                            } else {
                                                                callback();
                                                            }
                                                        });
                                                    });
                                                }
                                            }
                                        }
                                    });
                                });
                            }
                        }
                    ]
                },
                function (err) {
                    if (err) {
                        winston.error(err)
                    }
                }
            )
        }
    })
}

function openInbox(cb) {
    mailCheck.Imap.openBox('INBOX', cb)
}
module.exports = mailCheck
