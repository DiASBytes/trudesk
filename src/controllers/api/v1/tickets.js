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

var async = require('async')
var _ = require('lodash')
var moment = require('moment-timezone')
var winston = require('winston')
var permissions = require('../../../permissions')
var emitter = require('../../../emitter')
var path = require('path')
var fs = require('fs')

var apiTickets = {}

function buildGraphData(arr, days, callback) {
    var graphData = []
    var today = moment()
        .hour(23)
        .minute(59)
        .second(59)
    var timespanArray = []
    for (var i = days; i--;) {
        timespanArray.push(i)
    }

    _.each(timespanArray, function (day) {
        var obj = {}
        var d = today.clone().subtract(day, 'd')
        obj.date = d.format('YYYY-MM-DD')

        var $dateCount = _.filter(arr, function (v) {
            return (
                v.date <= d.toDate() &&
                v.date >=
                d
                    .clone()
                    .subtract(1, 'd')
                    .toDate()
            )
        })

        $dateCount = _.size($dateCount)
        obj.value = $dateCount
        graphData.push(obj)
    })

    if (_.isFunction(callback)) {
        return callback(graphData)
    }

    return graphData
}

function buildAvgResponse(ticketArray, callback) {
    var cbObj = {}
    var $ticketAvg = []
    _.each(ticketArray, function (ticket) {
        if (_.isUndefined(ticket.comments) || _.size(ticket.comments) < 1) return

        var ticketDate = moment(ticket.date)
        var firstCommentDate = moment(ticket.comments[0].date)

        var diff = firstCommentDate.diff(ticketDate, 'seconds')
        $ticketAvg.push(diff)
    })

    var ticketAvgTotal = _($ticketAvg).reduce(function (m, x) {
        return m + x
    }, 0)

    var tvt = moment.duration(Math.round(ticketAvgTotal / _.size($ticketAvg)), 'seconds').asHours()
    cbObj.avgResponse = Math.floor(tvt)

    if (_.isFunction(callback)) {
        return callback(cbObj)
    }

    return cbObj
}

/**
 * @api {get} /api/v1/tickets/ Get Tickets
 * @apiName getTickets
 * @apiDescription Gets tickets for the given User
 * @apiVersion 0.1.0
 * @apiGroup Ticket
 * @apiHeader {string} accesstoken The access token for the logged in user
 * @apiExample Example usage:
 * curl -H "accesstoken: {accesstoken}" -l http://localhost/api/v1/tickets
 *
 * @apiSuccess {object}     _id                 The MongoDB ID
 * @apiSuccess {number}     uid                 Unique ID (seq num)
 * @apiSuccess {object}     owner               User
 * @apiSuccess {object}     owner._id           The MongoDB ID of Owner
 * @apiSuccess {string}     owner.username      Username
 * @apiSuccess {string}     owner.fullname      User Full Name
 * @apiSuccess {string}     owner.email         User Email Address
 * @apiSuccess {string}     owner.role          User Permission Role
 * @apiSuccess {string}     owner.title         User Title
 * @apiSuccess {string}     owner.image         User Image Rel Path
 * @apiSuccess {object}     group               Group
 * @apiSuccess {object}     group._id           Group MongoDB ID
 * @apiSuccess {string}     group.name          Group Name
 * @apiSuccess {object}     assignee            User Assigned
 * @apiSuccess {object}     assignee._id        The MongoDB ID of Owner
 * @apiSuccess {string}     assignee.username   Username
 * @apiSuccess {string}     assignee.fullname   User Full Name
 * @apiSuccess {string}     assignee.email      User Email Address
 * @apiSuccess {string}     assignee.role       User Permission Role
 * @apiSuccess {string}     assignee.title      User Title
 * @apiSuccess {string}     assignee.image      User Image Rel Path
 * @apiSuccess {date}       date                Created Date
 * @apiSuccess {date}       updated             Last Updated DateTime
 * @apiSuccess {boolean}    deleted             Deleted Flag
 * @apiSuccess {object}     type                Ticket Type
 * @apiSuccess {object}     type._id            Type MongoDB ID
 * @apiSuccess {string}     type.name           Type Name
 * @apiSuccess {number}     status              Status of Ticket
 * @apiSuccess {number}     prioirty            Prioirty of Ticket
 * @apiSuccess {array}      tags                Array of Tags
 * @apiSuccess {string}     subject             Subject Text
 * @apiSuccess {string}     issue               Issue Text
 * @apiSuccess {date}       closedDate          Date Ticket was closed
 * @apiSuccess {array}      comments            Array of Comments
 * @apiSuccess {array}      attachments         Array of Attachments
 * @apiSuccess {array}      history             Array of History items
 *
 */
apiTickets.get = function (req, res) {
    var l = req.query.limit ? req.query.limit : 10
    var limit = parseInt(l)
    var page = parseInt(req.query.page)
    var assignedSelf = req.query.assignedself
    var status = req.query.status
    var user = req.user

    var object = {
        user: user,
        limit: limit,
        page: page,
        assignedSelf: assignedSelf,
        status: status
    }

    var ticketModel = require('../../../models/ticket')
    var groupModel = require('../../../models/group')

    async.waterfall(
        [
            function (callback) {
                groupModel.getAllGroupsOfUserNoPopulate(user._id, function (err, grps) {
                    callback(err, grps)
                })
            },
            function (grps, callback) {
                if (permissions.canThis(user.role, 'tickets:public')) {
                    groupModel.getAllPublicGroups(function (err, publicGroups) {
                        if (err) return callback(err)

                        grps = grps.concat(publicGroups)

                        return callback(null, grps)
                    })
                } else {
                    return callback(null, grps)
                }
            },
            function (grps, callback) {
                ticketModel.getTicketsWithObject(grps, object, function (err, results) {
                    if (!permissions.canThis(user.role, 'comments:view')) {
                        _.each(results, function (ticket) {
                            ticket.comments = []
                        })
                    }

                    if (!permissions.canThis(user.role, 'tickets:notes')) {
                        _.each(results, function (ticket) {
                            ticket.notes = []
                        })
                    }

                    // sanitize
                    _.each(results, function (ticket) {
                        ticket.subscribers = _.map(ticket.subscribers, function (s) {
                            return s._id
                        })

                        ticket.history = _.map(ticket.history, function (h) {
                            var obj = {
                                date: h.date,
                                _id: h._id,
                                action: h.action,
                                description: h.description,
                                owner: _.clone(h.owner)
                            }
                            obj.owner.role = h.owner.role._id
                            return obj
                        })

                        ticket.owner.role = ticket.owner.role._id
                    })

                    return callback(err, results)
                })
            }
        ],
        function (err, results) {
            if (err) return res.send('Error: ' + err.message)

            return res.json(results)
        }
    )
}


/**
 * @api {get} /api/v1/tickets/group/:name Get Tickets by Group
 * @apiName getByGroup
 * @apiDescription Gets tickets for specific group
 * @apiVersion 0.1.7
 * @apiGroup Ticket
 * @apiHeader {string} accesstoken The access token for the logged in user
 *
 * @apiExample Example usage:
 * curl -H "accesstoken: {accesstoken}" -l http://localhost/api/v1/tickets/group/d-vdh.be
 *
 * @apiSuccess {number} count Count of Tickets Array
 * @apiSuccess {array} tickets Tickets Array
 *
 * @apiError InvalidRequest The data was invalid
 * @apiErrorExample
 *      HTTP/1.1 400 Bad Request
 {
     "error": "Invalid Group name"
 }
 */
apiTickets.getByGroup = function (req, res) {
    var ticketSchema = require('../../../models/ticket');
    var groupSchema = require('../../../models/group')

    groupSchema.getGroupByName(req.params.name, function (err, group) {
        if (err) return res.status(400).json({ success: false, error: err.message })
        if (!group) {
            return res.json({
                success: false,
                tickets: []
            });
        }

        ticketSchema.getAllByGroup(group._id, function (err, tickets) {
            if (err) return res.status(400).json({ success: false, error: err.message })

            res.json({
                success: true,
                tickets: tickets
            });
        });
    });
}

/**
 * @api {get} /api/v1/tickets/search/?search={searchString} Get Tickets by Search String
 * @apiName search
 * @apiDescription Gets tickets via search string
 * @apiVersion 0.1.7
 * @apiGroup Ticket
 * @apiHeader {string} accesstoken The access token for the logged in user
 *
 * @apiExample Example usage:
 * curl -H "accesstoken: {accesstoken}" -l http://localhost/api/v1/tickets/search/?search=searchString
 *
 * @apiSuccess {number} count Count of Tickets Array
 * @apiSuccess {array} tickets Tickets Array
 *
 * @apiError InvalidRequest The data was invalid
 * @apiErrorExample
 *      HTTP/1.1 400 Bad Request
 {
     "error": "Invalid Ticket"
 }
 */
apiTickets.search = function (req, res) {
    var searchString = req.query.search

    var ticketModel = require('../../../models/ticket')
    var groupModel = require('../../../models/group')

    async.waterfall(
        [
            function (callback) {
                groupModel.getAllGroupsOfUserNoPopulate(req.user._id, function (err, grps) {
                    callback(err, grps)
                })
            },
            function (grps, callback) {
                if (permissions.canThis(req.user.role, 'tickets:public')) {
                    groupModel.getAllPublicGroups(function (err, publicGroups) {
                        if (err) return callback(err)

                        grps = grps.concat(publicGroups)

                        return callback(null, grps)
                    })
                } else {
                    return callback(null, grps)
                }
            },
            function (grps, callback) {
                ticketModel.getTicketsWithSearchString(grps, searchString, function (err, results) {
                    if (!permissions.canThis(req.user.role.role, 'tickets:notes')) {
                        _.each(results, function (ticket) {
                            ticket.notes = []
                        })
                    }

                    return callback(err, results)
                })
            }
        ],
        function (err, results) {
            if (err) return res.status(400).json({ success: false, error: 'Error - ' + err.message })

            return res.json({
                success: true,
                error: null,
                count: _.size(results),
                tickets: _.sortBy(results, 'uid').reverse()
            })
        }
    )
}

const createTicket = function (postData, userId, cb) {
    var response = {}
    response.status = 200;
    response.success = true;

    if (!_.isObject(postData) || !postData.subject || !postData.issue) {
        response.error = 'Invalid post data';
        return cb(response);
    }

    if (_.isUndefined(postData.tags) || _.isNull(postData.tags)) {
        postData.tags = []
    } else if (!_.isArray(postData.tags)) {
        postData.tags = [postData.tags]
    }

    var HistoryItem = {
        action: 'ticket:created',
        description: 'Ticket was created.',
        owner: userId
    }

    var TicketSchema = require('../../../models/ticket')
    var ticket = new TicketSchema(postData)
    if (!_.isUndefined(postData.owner)) {
        ticket.owner = postData.owner
    } else {
        ticket.owner = userId
    }

    var marked = require('marked')
    var tIssue = ticket.issue
    tIssue = tIssue.replace(/(\r\n|\n\r|\r|\n)/g, '<br>')
    ticket.issue = marked(tIssue)
    ticket.history = [HistoryItem]
    ticket.subscribers = [userId]

    ticket.save(function (err, t) {
        if (err) {
            response.success = false
            response.status = 500
            response.error = err
            winston.debug(response)
            return cb(response);
        }

        response.ticket = t

        if (postData.file) {
            const attachments = [];

            const publicPath = path.join(__dirname, '../../../../public/');

            if (!fs.existsSync(`${publicPath}uploads/tickets/${ticket._id}`))
                fs.mkdirSync(`${publicPath}uploads/tickets/${ticket._id}`);

            fs.rename(postData.file, `${publicPath}uploads/tickets/${ticket._id}/${postData.filename}`, function (err) {
                if (err)
                    throw err
            })

            attachments.push({
                owner: postData.owner,
                name: postData.filename,
                date: new Date(),
                path: `/uploads/tickets/${ticket._id}/${postData.filename}`,
                type: 'image'
            })

            if (attachments.length) {
                ticket.addAttachments(ticket._id, attachments, function () {
                    ticket.save(function (err, t) {
                        if (err) {
                            winston.debug("Attachement add failed!");
                        } else {
                            return cb(response);
                        }
                    });
                });
            }
        } else {

            return cb(response);
        }
    });
};

/**
 * @api {post} /api/v1/tickets/create Create Ticket
 * @apiName createTicket
 * @apiDescription Creates a ticket with the given post data.
 * @apiVersion 0.1.0
 * @apiGroup Ticket
 * @apiHeader {string} accesstoken The access token for the logged in user
 *
 * @apiParamExample {json} Request-Example:
 * {
 *      "subject": "Subject",
 *      "issue": "Issue Exmaple",
 *      "owner": {OwnerId},
 *      "group": {GroupId},
 *      "type": {TypeId},
 *      "prioirty": {PriorityId},
 *      "tags": [{tagId}]
 * }
 *
 * @apiExample Example usage:
 * curl -X POST
 *      -H "Content-Type: application/json"
 *      -H "accesstoken: {accesstoken}"
 *      -d "{\"subject\":\"{subject}\",\"owner\":{ownerId}, group: \"{groupId}\", type: \"{typeId}\", issue: \"{issue}\", prioirty: \"{prioirty}\"}"
 *      -l http://localhost/api/v1/tickets/create
 *
 * @apiSuccess {boolean} success If the Request was a success
 * @apiSuccess {object} error Error, if occurred
 * @apiSuccess {object} ticket Saved Ticket Object
 *
 * @apiError InvalidPostData The data was invalid
 * @apiErrorExample
 *      HTTP/1.1 400 Bad Request
        {
            "error": "Invalid Post Data"
        }
 */
apiTickets.create = function (req, res) {
    var postData = req.body;

    var socketId = _.isUndefined(postData.socketId) ? '' : postData.socketId

    createTicket(postData, req.user._id, function (response) {
        if (!response.success) {
            res.status(response.status).json(response);
        }
        emitter.emit('ticket:created', {
            hostname: req.headers.host,
            socketId: socketId,
            ticket: response.ticket
        });

        res.status(response.status).json(response);
    });
}

apiTickets.createWithFile = function (req, res) {
    var postData = {};
    var Busboy = require('busboy')
    var busboy = new Busboy({
        headers: req.headers
    })

    var socketId = _.isUndefined(postData.socketId) ? '' : postData.socketId

    busboy.on('field', function (fieldname, val, fieldnameTruncated, valTruncated, encoding, mimetype) {
        postData[fieldname] = val;
    });

    busboy.on('file', function (fieldname, file, filename, encoding, mimetype) {
        var savePath = path.join(__dirname, `../../../../public/uploads/tmp/${filename}`)
        file.pipe(fs.createWriteStream(savePath));
        postData.file = savePath;
    })

    busboy.on('finish', function () {
        createTicket(postData, req.user._id, function (response) {
            emitter.emit('ticket:created', {
                hostname: req.headers.host,
                socketId: socketId,
                ticket: response.ticket
            })

            res.status(response.status).json(response);
        });
    });

    req.pipe(busboy);
}

/**
 * @api {post} /api/v1/public/tickets/create Create Public Ticket
 * @apiName createPublicTicket
 * @apiDescription Creates a ticket with the given post data via public ticket submission. [Limited to Server Origin]
 * @apiVersion 0.1.7
 * @apiGroup Ticket
 *
 * @apiParamExample {json} Request-Example:
 * {
 *      "fullname": "Full Name",
 *      "email": "email@email.com",
 *      "subject": "Subject",
 *      "issue": "Issue Exmaple"
 * }
 *
 * @apiExample Example usage:
 * curl -X POST
 *      -H "Content-Type: application/json"
 *      -d "{\"fullname\":\"{fullname}\",\"email\":{email}, \"subject\": \"{subject}\", \"issue\": \"{issue}\"}"
 *      -l http://localhost/api/v1/public/tickets/create
 *
 * @apiSuccess {boolean} success If the Request was a success
 * @apiSuccess {object} error Error, if occurred
 * @apiSuccess {object} ticket Saved Ticket Object
 *
 * @apiError InvalidPostData The data was invalid
 * @apiErrorExample
 *      HTTP/1.1 400 Bad Request
 {
     "error": "Invalid Post Data"
 }
 */
apiTickets.createPublicTicket = function (req, res) {
    var Chance = require('chance')

    var chance = new Chance()
    var response = {}
    response.success = true
    var postData = req.body
    if (!_.isObject(postData)) return res.status(400).json({ success: false, error: 'Invalid Post Data' })

    var user, group, ticket, plainTextPass

    async.waterfall(
        [
            function (next) {
                var settingSchmea = require('../../../models/setting')
                settingSchmea.getSetting('role:user:default', function (err, roleDefault) {
                    if (err) return next(err)
                    if (!roleDefault) {
                        winston.error('No Default User Role Set. (Settings > Permissions > Default User Role)')
                        return next('No Default Role Set')
                    }

                    return next(null, roleDefault)
                })
            },
            function (roleDefault, next) {
                var UserSchema = require('../../../models/user')
                plainTextPass = chance.string({
                    length: 6,
                    pool: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890'
                })

                user = new UserSchema({
                    username: postData.user.email,
                    password: plainTextPass,
                    fullname: postData.user.fullname,
                    email: postData.user.email,
                    accessToken: chance.hash(),
                    role: roleDefault.value
                })

                user.save(function (err, savedUser) {
                    if (err) return next(err)

                    return next(null, savedUser)
                })
            },

            function (savedUser, next) {
                // Group Creation
                var GroupSchema = require('../../../models/group')
                group = new GroupSchema({
                    name: savedUser.email,
                    members: [savedUser._id],
                    sendMailTo: [savedUser._id],
                    public: true
                })

                group.save(function (err, group) {
                    if (err) return next(err)

                    return next(null, group, savedUser)
                })
            },

            function (group, savedUser, next) {
                var settingsSchema = require('../../../models/setting')
                settingsSchema.getSettingByName('ticket:type:default', function (err, defaultType) {
                    if (err) return next(err)

                    if (defaultType.value) {
                        return next(null, defaultType.value, group, savedUser)
                    }

                    return next('Failed: Invalid Default Ticket Type.')
                })
            },

            function (defaultTicketType, group, savedUser, next) {
                // Create Ticket
                var ticketTypeSchema = require('../../../models/tickettype')
                ticketTypeSchema.getType(defaultTicketType, function (err, ticketType) {
                    if (err) return next(err)

                    var TicketSchema = require('../../../models/ticket')
                    var HistoryItem = {
                        action: 'ticket:created',
                        description: 'Ticket was created.',
                        owner: savedUser._id
                    }
                    ticket = new TicketSchema({
                        owner: savedUser._id,
                        group: group._id,
                        type: ticketType._id,
                        priority: _.first(ticketType.priorities)._id, // TODO: change when priority order is complete!
                        subject: postData.ticket.subject,
                        issue: postData.ticket.issue,
                        history: [HistoryItem],
                        subscribers: [savedUser._id]
                    })

                    var marked = require('marked')
                    var tIssue = ticket.issue
                    tIssue = tIssue.replace(/(\r\n|\n\r|\r|\n)/g, '<br>')
                    ticket.issue = marked(tIssue)

                    ticket.save(function (err, t) {
                        if (err) return next(err)

                        emitter.emit('ticket:created', {
                            hostname: req.headers.host,
                            socketId: '',
                            ticket: t
                        })

                        return next(null, { user: savedUser, group: group, ticket: t })
                    })
                })
            }
        ],
        function (err, result) {
            if (err) winston.debug(err)
            if (err) return res.status(400).json({ success: false, error: err.message })

            delete result.user.password
            result.user.password = undefined

            return res.json({
                success: true,
                userData: { savedUser: result.user, chancepass: plainTextPass },
                ticket: result.ticket
            })
        }
    )
}

/**
 * @api {get} /api/v1/tickets/:uid Get Single Ticket
 * @apiName singleTicket
 * @apiDescription Gets a ticket with the given UID.
 * @apiVersion 0.1.0
 * @apiGroup Ticket
 * @apiHeader {string} accesstoken The access token for the logged in user
 *
 * @apiExample Example usage:
 * curl -H "accesstoken: {accesstoken}" -l http://localhost/api/v1/tickets/1000
 *
 * @apiSuccess {boolean} success If the Request was a success
 * @apiSuccess {object} error Error, if occurred
 * @apiSuccess {object} ticket Ticket Object
 *
 * @apiError InvalidRequest The data was invalid
 * @apiErrorExample
 *      HTTP/1.1 400 Bad Request
 {
     "error": "Invalid Ticket"
 }
 */
apiTickets.single = function (req, res) {
    var uid = req.params.uid
    if (_.isUndefined(uid)) return res.status(200).json({ success: false, error: 'Invalid Ticket' })

    var ticketModel = require('../../../models/ticket')
    ticketModel.getTicketByUid(uid, function (err, ticket) {
        if (err) return res.send(err)

        if (_.isUndefined(ticket) || _.isNull(ticket)) {
            return res.status(200).json({ success: false, error: 'Invalid Ticket' })
        }

        ticket = _.clone(ticket._doc)
        if (!permissions.canThis(req.user.role, 'tickets:notes')) {
            delete ticket.notes
        }

        return res.json({ success: true, ticket: ticket })
    })
}

/**
 * @api {put} /api/v1/tickets/:id Update Ticket
 * @apiName updateTicket
 * @apiDescription Updates ticket via given OID
 * @apiVersion 0.1.0
 * @apiGroup Ticket
 * @apiHeader {string} accesstoken The access token for the logged in user
 *
 * @apiExample Example usage:
 * curl -H "Content-Type: application/json"
 *      -H "accesstoken: {accesstoken}"
 *      -X PUT -d "{\"status\": {status},\"group\": \"{group}\"}"
 *      -l http://localhost/api/v1/tickets/{id}
 *
 * @apiSuccess {boolean} success If the Request was a success
 * @apiSuccess {object} error Error, if occurred
 * @apiSuccess {object} ticket Updated Ticket Object
 *
 * @apiError InvalidRequest The data was invalid
 * @apiErrorExample
 *      HTTP/1.1 400 Bad Request
 {
     "error": "Invalid Post Data"
 }
 */
apiTickets.update = function (req, res) {
    var user = req.user
    if (!_.isUndefined(user) && !_.isNull(user)) {
        var permissions = require('../../../permissions')
        if (!permissions.canThis(user.role, 'tickets:update')) {
            return res.status(401).json({ success: false, error: 'Invalid Permissions' })
        }
        var oId = req.params.id
        var reqTicket = req.body
        if (_.isUndefined(oId)) return res.status(400).json({ success: false, error: 'Invalid Ticket ObjectID.' })
        var ticketModel = require('../../../models/ticket')
        ticketModel.getTicketById(oId, function (err, ticket) {
            if (err) return res.status(400).json({ success: false, error: err.message })
            async.parallel(
                [
                    function (cb) {
                        if (!_.isUndefined(reqTicket.status)) {
                            ticket.status = reqTicket.status
                        }

                        return cb()
                    },
                    function (cb) {
                        if (!_.isUndefined(reqTicket.subject)) {
                            ticket.subject = reqTicket.subject
                        }

                        return cb()
                    },
                    function (cb) {
                        if (!_.isUndefined(reqTicket.group)) {
                            ticket.group = reqTicket.group._id

                            ticket.populate('group', function () {
                                return cb()
                            })
                        } else {
                            return cb()
                        }
                    },
                    function (cb) {
                        if (!_.isUndefined(reqTicket.closedDate)) {
                            ticket.closedDate = reqTicket.closedDate
                        }

                        return cb()
                    },
                    function (cb) {
                        if (!_.isUndefined(reqTicket.tags) && !_.isNull(reqTicket.tags)) {
                            ticket.tags = reqTicket.tags
                        }

                        return cb()
                    },
                    function (cb) {
                        if (!_.isUndefined(reqTicket.issue) && !_.isNull(reqTicket.issue)) {
                            ticket.issue = reqTicket.issue
                        }

                        return cb()
                    },
                    function (cb) {
                        if (!_.isUndefined(reqTicket.assignee) && !_.isNull(reqTicket.assignee)) {
                            ticket.assignee = reqTicket.assignee
                            ticket.populate('assignee', function (err, t) {
                                if (err) return cb(err)

                                var HistoryItem = {
                                    action: 'ticket:set:assignee',
                                    description: t.assignee.fullname + ' was set as assignee',
                                    owner: req.user._id
                                }

                                ticket.history.push(HistoryItem)

                                return cb()
                            })
                        } else {
                            return cb()
                        }
                    }
                ],
                function () {
                    ticket.save(function (err, t) {
                        if (err) {
                            return res.status(400).json({ success: false, error: err.message })
                        }

                        if (!permissions.canThis(user.role, 'tickets:notes')) {
                            t.notes = []
                        }

                        emitter.emit('ticket:updated', t)

                        return res.json({
                            success: true,
                            error: null,
                            ticket: t
                        })
                    })
                }
            )
        })
    } else {
        return res.status(403).json({ success: false, error: 'Invalid Access Token' })
    }
}

/**
 * @api {delete} /api/v1/tickets/:id Delete Ticket
 * @apiName deleteTicket
 * @apiDescription Deletes ticket via given OID
 * @apiVersion 0.1.0
 * @apiGroup Ticket
 * @apiHeader {string} accesstoken The access token for the logged in user
 *
 * @apiExample Example usage:
 * curl -X DELETE -H "accesstoken: {accesstoken}" -l http://localhost/api/v1/tickets/{id}
 *
 * @apiSuccess {boolean} success If the Request was a success
 * @apiSuccess {object} error Error, if occurred
 *
 * @apiError InvalidRequest The data was invalid
 * @apiErrorExample
 *      HTTP/1.1 400 Bad Request
 {
     "error": "Invalid Post Data"
 }
 */
apiTickets.delete = function (req, res) {
    var oId = req.params.id
    var user = req.user

    if (_.isUndefined(oId) || _.isUndefined(user))
        return res.status(400).json({ success: false, error: 'Invalid Post Data' })

    var ticketModel = require('../../../models/ticket')
    ticketModel.softDelete(oId, function (err) {
        if (err) return res.status(400).json({ success: false, error: 'Invalid Post Data' })

        emitter.emit('ticket:deleted', oId)
        res.json({ success: true, error: null })
    })
}

/**
 * @api {post} /api/v1/tickets/addcomment Add Comment
 * @apiName addComment
 * @apiDescription Adds comment to the given Ticket Id
 * @apiVersion 0.1.0
 * @apiGroup Ticket
 * @apiHeader {string} accesstoken The access token for the logged in user
 * @apiExample Example usage:
 * curl -X POST
 *      -H "Content-Type: application/json"
 *      -H "accesstoken: {accesstoken}"
 *      -d "{\"comment\":\"{comment}\",\"owner\":{ownerId}, ticketId: \"{ticketId}\"}"
 *      -l http://localhost/api/v1/tickets/addcomment
 *
 * @apiParamExample {json} Request:
 * {
 *      "comment": "Comment Text",
 *      "owner": {OwnerId},
 *      "ticketid": {TicketId}
 * }
 *
 * @apiSuccess {boolean} success Successful
 * @apiSuccess {string} error Error if occurrred
 * @apiSuccess {object} ticket Ticket Object
 *
 * @apiError InvalidPostData The data was invalid
 * @apiErrorExample
 *      HTTP/1.1 400 Bad Request
 {
     "error": "Invalid Post Data"
 }
 */
apiTickets.postComment = function (req, res) {
    var commentJson = req.body
    var comment = commentJson.comment
    var owner = commentJson.ownerId
    var ticketId = commentJson._id

    if (_.isUndefined(ticketId)) return res.status(400).json({ success: false, error: 'Invalid Post Data' });
    
    var userModel = require('../../../models/user')
    
    userModel.findById(owner, function (err, user) {
        if (err) return res.status(400).json({ success: false, error: 'Invalid User' })

        var commentOwner = user.email;

        var ticketModel = require('../../../models/ticket')
    
        ticketModel.getTicketById(ticketId, function (err, t) {
            if (err) return res.status(400).json({ success: false, error: 'Invalid Post Data' })
    
            if (_.isUndefined(comment)) return res.status(400).json({ success: false, error: 'Invalid Post Data' })
    
            var marked = require('marked')
            marked.setOptions({
                breaks: true
            })
    
            var Comment = {
                owner: owner,
                date: new Date(),
                comment: marked(comment).replace(/<img src/g, '<img style="max-width:650px" src')
            }
    
            if(user.htmlSignature && user.htmlSignature.length !== 0) {
                Comment.comment += user.htmlSignature;
            }

            t.updated = Date.now()
    
            t.comments.push(Comment)
            
            t.needsAttention = !commentOwner.includes('diasbytes.com');
            
            var HistoryItem = {
                action: 'ticket:comment:added',
                description: 'Comment was added',
                owner: owner
            }

            t.history.push(HistoryItem)
    
            t.save(function (err, tt) {
                if (err) return res.status(400).json({ success: false, error: err.message })
    
                if (!permissions.canThis(req.user.role, 'tickets:notes')) {
                    tt.notes = []
                }
    
                ticketModel.populate(tt, 'subscribers comments.owner', function (err) {
                    if (err) return res.json({ success: true, error: null, ticket: tt })
    
                    if (tt.status === 0) {
                        tt.setStatus(tt.owner._id, {
                            status: 1
                        }, function (err, ticket) {
                            if (err) { }
                            tt.save(function (err, ttt) {
                                if (err) { }
                                emitter.emit('ticket:comment:added', ticket, Comment, req.headers.host)
                            });
                        });
                    } else {
                        emitter.emit('ticket:comment:added', tt, Comment, req.headers.host)
                    }
    
                    return res.json({ success: true, error: null, ticket: tt })
                })
            })
        })
    })
}

/**
 * @api {post} /api/v1/tickets/addnote Add Note
 * @apiName addInternalNote
 * @apiDescription Adds a note to the given Ticket Id
 * @apiVersion 0.1.10
 * @apiGroup Ticket
 * @apiHeader {string} accesstoken The access token for the logged in user
 * @apiExample Example usage:
 * curl -X POST
 *      -H "Content-Type: application/json"
 *      -H "accesstoken: {accesstoken}"
 *      -d "{\"note\":\"{note}\",\"owner\":{ownerId}, ticketId: \"{ticketId}\"}"
 *      -l http://localhost/api/v1/tickets/addnote
 *
 * @apiParamExample {json} Request:
 * {
 *      "note": "Note Text",
 *      "owner": {OwnerId},
 *      "ticketid": {TicketId}
 * }
 *
 * @apiSuccess {boolean} success Successful
 * @apiSuccess {string} error Error if occurrred
 * @apiSuccess {object} ticket Ticket Object
 *
 * @apiError InvalidPostData The data was invalid
 * @apiErrorExample
 *      HTTP/1.1 400 Bad Request
 {
     "error": "Invalid Post Data"
 }
 */
apiTickets.postInternalNote = function (req, res) {
    var payload = req.body
    if (_.isUndefined(payload.ticketid)) return res.status(400).json({ success: false, error: 'Invalid Post Data' })
    var ticketModel = require('../../../models/ticket')
    ticketModel.getTicketById(payload.ticketid, function (err, ticket) {
        if (err) return res.status(400).json({ success: false, error: err.message })

        if (_.isUndefined(payload.note)) return res.status(400).json({ success: false, error: 'Invalid Post Data' })

        var marked = require('marked')
        // var note = payload.note.replace(/(\r\n|\n\r|\r|\n)/g, "<br>");
        var Note = {
            owner: payload.owner,
            date: new Date(),
            note: marked(payload.note)
        }

        ticket.updated = Date.now()
        ticket.notes.push(Note)
        var HistoryItem = {
            action: 'ticket:note:added',
            description: 'Internal note was added',
            owner: payload.owner
        }
        ticket.history.push(HistoryItem)

        ticket.save(function (err, savedTicket) {
            if (err) return res.status(400).json({ success: false, error: err.message })

            ticketModel.populate(savedTicket, 'subscribers notes.owner', function (err) {
                if (err) return res.json({ success: true, ticket: savedTicket })

                emitter.emit('ticket:note:added', savedTicket, Note)

                return res.json({ success: true, ticket: savedTicket })
            })
        })
    })
}

/**
 * @api {get} /api/v1/tickets/types Get Ticket Types
 * @apiName getTicketTypes
 * @apiDescription Gets all available ticket types.
 * @apiVersion 0.1.0
 * @apiGroup Ticket
 * @apiHeader {string} accesstoken The access token for the logged in user
 *
 * @apiExample Example usage:
 * curl -H "accesstoken: {accesstoken}" -l http://localhost/api/v1/tickets/types
 *
 * @apiError InvalidRequest Invalid Post Data
 *
 */
apiTickets.getTypes = function (req, res) {
    var ticketType = require('../../../models/tickettype')
    ticketType.getTypes(function (err, types) {
        if (err) return res.status(400).json({ success: false, error: 'Invalid Post Data' })

        return res.json(types)
    })
}

apiTickets.getType = function (req, res) {
    var id = req.params.id
    if (!id) return res.status(400).json({ success: false, error: 'Invalid Type ID' })

    var ticketType = require('../../../models/tickettype')
    ticketType.getType(id, function (err, type) {
        if (err) return res.status(400).json({ success: false, error: 'Invalid Type ID' })

        return res.json({ success: true, type: type })
    })
}

/**
 * @api {post} /api/v1/tickets/types/create Create Ticket Type
 * @apiName createType
 * @apiDescription Creates a new ticket type
 * @apiVersion 0.1.10
 * @apiGroup Ticket
 * @apiHeader {string} accesstoken The access token for the logged in user
 *
 * @apiExample Example usage:
 * curl -X POST
 *      -H "accesstoken: {accesstoken}"
 *      -d "{\"name\": \"TypeName\"}"
 *      -l http://localhost/api/v1/tickets/types/create
 *
 * @apiSuccess {boolean} success Successfully?
 * @apiSuccess {Object} tickettype Returns the newly create ticket type
 *
 */
apiTickets.createType = function (req, res) {
    var typeName = req.body.name
    var ticketTypeSchema = require('../../../models/tickettype')
    var ticketPrioritiesSchema = require('../../../models/ticketpriority')

    if (_.isUndefined(typeName) || typeName.length < 3)
        return res.status(400).json({ success: false, error: 'Invalid Type Name!' })

    ticketPrioritiesSchema.find({ default: true }, function (err, priorities) {
        if (err) return res.status(400).json({ success: false, error: err.message })
        priorities = _.sortBy(priorities, 'migrationNum')

        ticketTypeSchema.create({ name: typeName, priorities: priorities }, function (err, ticketType) {
            if (err) return res.status(400).json({ success: false, error: err.message })

            return res.json({ success: true, tickettype: ticketType })
        })
    })
}

/**
 * @api {put} /api/v1/tickets/types/:id Update Ticket Type
 * @apiName updateType
 * @apiDescription Updates given ticket type
 * @apiVersion 0.1.10
 * @apiGroup Ticket
 * @apiHeader {string} accesstoken The access token for the logged in user
 *
 * @apiExample Example usage:
 * curl -X PUT -H "accesstoken: {accesstoken}" -l http://localhost/api/v1/tickets/types/:id
 *
 * @apiSuccess {boolean} success Successfully?
 * @apiSuccess {object} tag Updated Ticket Type
 *
 */
apiTickets.updateType = function (req, res) {
    var id = req.params.id

    var data = req.body

    var ticketTypeSchema = require('../../../models/tickettype')

    if (_.isUndefined(id) || _.isNull(id) || _.isNull(data) || _.isUndefined(data)) {
        return res.status(400).json({ success: false, error: 'Invalid Put Data' })
    }

    ticketTypeSchema.getType(id, function (err, type) {
        if (err) return res.status(400).json({ success: false, error: err.message })

        type.name = data.name

        type.save(function (err, t) {
            if (err) return res.status(400).json({ success: false, error: err.message })

            return res.json({ success: true, type: t })
        })
    })
}

apiTickets.typeAddPriority = function (req, res) {
    var id = req.params.id

    var data = req.body

    var ticketTypeSchema = require('../../../models/tickettype')

    if (!id || !data || !data.priority) {
        return res.status(400).json({ success: false, error: 'Invalid request data' })
    }

    ticketTypeSchema.getType(id, function (err, type) {
        if (err) return res.status(400).json({ success: false, error: err.message })

        type.addPriority(data.priority, function (err, type) {
            if (err) return res.status(400).json({ success: false, error: err.message })

            type.save(function (err, t) {
                if (err) return res.status(400).json({ success: false, error: err.message })

                t.populate('priorities', function (err, tt) {
                    if (err) return res.status(400).json({ success: false, error: err.message })

                    return res.json({ success: true, type: tt })
                })
            })
        })
    })
}

apiTickets.typeRemovePriority = function (req, res) {
    var id = req.params.id

    var data = req.body

    var ticketTypeSchema = require('../../../models/tickettype')

    if (!id || !data || !data.priority) {
        return res.status(400).json({ success: false, error: 'Invalid request data' })
    }

    ticketTypeSchema.getType(id, function (err, type) {
        if (err) return res.status(400).json({ success: false, error: err.message })

        type.removePriority(data.priority, function (err, type) {
            if (err) return res.status(400).json({ success: false, error: err.message })

            type.save(function (err, t) {
                if (err) return res.status(400).json({ success: false, error: err.message })

                t.populate('priorities', function (err, tt) {
                    if (err) return res.status(400).json({ success: false, error: err.message })

                    return res.json({ success: true, type: tt })
                })
            })
        })
    })
}

/**
 * @api {delete} /api/v1/tickets/types/:id Delete Ticket Type
 * @apiName deleteType
 * @apiDescription Deletes given ticket type
 * @apiVersion 0.1.10
 * @apiGroup Ticket
 * @apiHeader {string} accesstoken The access token for the logged in user
 *
 * @apiExample Example usage:
 * curl -X DELETE
 *      -H "accesstoken: {accesstoken}"
 *      -d "{\"newTypeId\": \"{ObjectId}\"}"
 *      -l http://localhost/api/v1/tickets/types/:id
 *
 * @apiSuccess {boolean} success Successfully?
 * @apiSuccess {number} updated Count of Tickets updated to new type
 *
 */
apiTickets.deleteType = function (req, res) {
    var newTypeId = req.body.newTypeId
    var delTypeId = req.params.id
    console.log(newTypeId)
    if (_.isUndefined(newTypeId) || _.isUndefined(delTypeId)) {
        return res.status(400).json({ success: false, error: 'Invalid POST data.' })
    }

    var ticketTypeSchema = require('../../../models/tickettype')
    var ticketSchema = require('../../../models/ticket')
    var settingsSchema = require('../../../models/setting')

    async.waterfall(
        [
            function (next) {
                settingsSchema.getSettingByName('mailer:check:ticketype', function (err, setting) {
                    if (err) return next(err)
                    if (setting && setting.value.toString().toLowerCase() === delTypeId.toString().toLowerCase()) {
                        return next({
                            custom: true,
                            message: 'Type currently "Default Ticket Type" for mailer check.'
                        })
                    }

                    return next(null)
                })
            },
            function (next) {
                ticketSchema.updateType(delTypeId, newTypeId, next)
            },
            function (result, next) {
                ticketTypeSchema.getType(delTypeId, function (err, type) {
                    if (err) return next(err)

                    type.remove(function (err) {
                        if (err) return next(err)
                        return next(null, result)
                    })
                })
            }
        ],
        function (err, result) {
            if (err) return res.status(400).json({ success: false, error: err })
            return res.json({ success: true, updated: result.nModified })
        }
    )
}

apiTickets.createPriority = function (req, res) {
    var data = req.body

    var pName = data.name

    var pOverdueIn = data.overdueIn

    var pHtmlColor = data.htmlColor

    if (!pName) {
        return res.status(400).json({ success: false, error: 'Invalid Request Data.' })
    }

    var TicketPrioritySchema = require('../../../models/ticketpriority')

    var P = new TicketPrioritySchema({
        name: pName,
        overdueIn: pOverdueIn,
        htmlColor: pHtmlColor
    })

    P.save(function (err, savedPriority) {
        if (err) {
            return res.status(400).json({ success: false, error: err.message })
        }

        return res.json({ success: true, priority: savedPriority })
    })
}

apiTickets.getPriorities = function (req, res) {
    var ticketPrioritySchema = require('../../../models/ticketpriority')
    ticketPrioritySchema.find({}, function (err, priorities) {
        if (err) return res.status(400).json({ success: false, error: err.message })

        priorities = _.sortBy(priorities, ['migrationNum', 'name'])

        return res.json({ success: true, priorities: priorities })
    })
}

apiTickets.updatePriority = function (req, res) {
    var id = req.params.id

    var data = req.body

    if (_.isUndefined(id) || _.isNull(id) || _.isNull(data) || _.isUndefined(data)) {
        return res.status(400).json({ success: false, error: 'Invalid Request Data' })
    }

    var ticketPrioritySchema = require('../../../models/ticketpriority')
    ticketPrioritySchema.findOne({ _id: id }, function (err, priority) {
        if (err) return res.status(400).json({ success: false, error: err.message })

        if (data.name) {
            priority.name = data.name
        }
        if (data.htmlColor) {
            priority.htmlColor = data.htmlColor
        }
        if (data.overdueIn) {
            priority.overdueIn = data.overdueIn
        }

        priority.save(function (err, p) {
            if (err) return res.status(400).json({ success: false, error: err.message })

            return res.json({ success: true, priority: p })
        })
    })
}

apiTickets.deletePriority = function (req, res) {
    var id = req.params.id

    var newPriority = req.body.newPriority

    if (!id || !newPriority) {
        return res.status(400).json({ success: false, error: 'Invalid Request Data' })
    }

    async.series(
        [
            function (next) {
                var ticketSchema = require('../../../models/ticket')
                ticketSchema.updateMany({ priority: id }, { priority: newPriority }, next)
            },
            function (next) {
                var ticketPrioritySchema = require('../../../models/ticketpriority')
                ticketPrioritySchema.findOne({ _id: id }, function (err, priority) {
                    if (err) return next(err)

                    if (priority.default) {
                        return next('Unable to delete default priority: ' + priority.name)
                    }

                    priority.remove(next)
                })
            }
        ],
        function (err) {
            if (err) return res.status(400).json({ success: false, error: err.message })

            return res.json({ success: true })
        }
    )
}

/**
 * @api {get} /api/v1/tickets/stats Get Ticket Stats
 * @apiName getTicketStats
 * @apiDescription Gets cached ticket stats
 * @apiVersion 0.1.7
 * @apiGroup Ticket
 * @apiHeader {string} accesstoken The access token for the logged in user
 *
 * @apiExample Example usage:
 * curl -H "accesstoken: {accesstoken}" -l http://localhost/api/v1/tickets/stats
 *
 * @apiError InvalidRequest Invalid Post Data
 *
 */
apiTickets.getTicketStats = function (req, res) {
    var timespan = 30
    if (req.params.timespan) {
        timespan = parseInt(req.params.timespan)
    }

    var cache = global.cache

    if (_.isUndefined(cache)) {
        return res.status(400).send('Ticket stats are still loading...')
    }

    var obj = {}

    switch (timespan) {
        case 30:
            obj.data = cache.get('tickets:overview:e30:graphData')
            obj.ticketCount = cache.get('tickets:overview:e30:ticketCount')
            obj.closedCount = cache.get('tickets:overview:e30:closedTickets')
            obj.ticketAvg = cache.get('tickets:overview:e30:responseTime')
            break
        case 60:
            obj.data = cache.get('tickets:overview:e60:graphData')
            obj.ticketCount = cache.get('tickets:overview:e60:ticketCount')
            obj.closedCount = cache.get('tickets:overview:e60:closedTickets')
            obj.ticketAvg = cache.get('tickets:overview:e60:responseTime')
            break
        case 90:
            obj.data = cache.get('tickets:overview:e90:graphData')
            obj.ticketCount = cache.get('tickets:overview:e90:ticketCount')
            obj.closedCount = cache.get('tickets:overview:e90:closedTickets')
            obj.ticketAvg = cache.get('tickets:overview:e90:responseTime')
            break
        case 180:
            obj.data = cache.get('tickets:overview:e180:graphData')
            obj.ticketCount = cache.get('tickets:overview:e180:ticketCount')
            obj.closedCount = cache.get('tickets:overview:e180:closedTickets')
            obj.ticketAvg = cache.get('tickets:overview:e180:responseTime')
            break
        case 365:
            obj.data = cache.get('tickets:overview:e365:graphData')
            obj.ticketCount = cache.get('tickets:overview:e365:ticketCount')
            obj.closedCount = cache.get('tickets:overview:e365:closedTickets')
            obj.ticketAvg = cache.get('tickets:overview:e365:responseTime')
            break
        // case 0:
        //     obj.data = cache.get('tickets:overview:lifetime:graphData');
        //     obj.ticketCount = cache.get('tickets:overview:lifetime:ticketCount');
        //     obj.closedCount = cache.get('tickets:overview:lifetime:closedTickets');
        //     obj.ticketAvg = cache.get('tickets:overview:lifetime:responseTime');
        //     break;
    }

    obj.mostRequester = cache.get('quickstats:mostRequester')
    obj.mostCommenter = cache.get('quickstats:mostCommenter')
    obj.mostAssignee = cache.get('quickstats:mostAssignee')
    obj.mostActiveTicket = cache.get('quickstats:mostActiveTicket')

    obj.lastUpdated = cache.get('tickets:overview:lastUpdated')
    var settingsUtil = require('../../../settings/settingsUtil')
    settingsUtil.getSettings(function (err, context) {
        if (err) {
            return res.send(obj)
        }

        var tz = context.data.settings.timezone.value
        obj.lastUpdated = moment
            .utc(obj.lastUpdated)
            .tz(tz)
            .format('MM-DD-YYYY hh:mm:ssa')

        return res.send(obj)
    })
    // return res.send(obj);
}

function parseTicketStats(role, tickets, callback) {
    if (_.isEmpty(tickets)) return callback({ tickets: tickets, tags: {} })
    var t = []
    var tags = {}
    if (!permissions.canThis(role, 'tickets:notes')) {
        _.each(tickets, function (ticket) {
            ticket.notes = []
        })
    }

    async.each(
        tickets,
        function (ticket, cb) {
            _.each(ticket.tags, function (tag) {
                t.push(tag.name)
            })

            t = _.take(t, 10)

            return cb()
        },
        function () {
            _.mixin({
                sortKeysBy: function (obj, comparator) {
                    var keys = _.sortBy(_.keys(obj), function (key) {
                        return comparator ? comparator(obj[key], key) : key
                    })

                    return _.zipObject(
                        keys,
                        _.map(keys, function (key) {
                            return obj[key]
                        })
                    )
                }
            })

            tags = _.countBy(t, function (k) {
                return k
            })
            tags = _(tags)
                .toPairs()
                .sortBy(0)
                .fromPairs()
                .value()

            return callback({ tickets: tickets, tags: tags })
        }
    )
}

/**
 * @api {get} /api/v1/tickets/stats/group/:group Get Ticket Stats For Group
 * @apiName getTicketStatsForGroup
 * @apiDescription Gets live ticket stats for given groupId
 * @apiVersion 0.1.7
 * @apiGroup Ticket
 * @apiHeader {string} accesstoken The access token for the logged in user
 *
 * @apiExample Example usage:
 * curl -H "accesstoken: {accesstoken}" -l http://localhost/api/v1/tickets/stats/group/{groupid}
 *
 * @apiError InvalidRequest Invalid Post Data
 *
 */
apiTickets.getTicketStatsForGroup = function (req, res) {
    var groupId = req.params.group
    if (groupId === 0) return res.status(200).json({ success: false, error: 'Please Select Group.' })
    if (_.isUndefined(groupId)) return res.status(400).json({ success: false, error: 'Invalid Group Id.' })

    var ticketModel = require('../../../models/ticket')
    var data = {}
    var tags = {}
    async.waterfall(
        [
            function (callback) {
                ticketModel.getTickets([groupId], function (err, tickets) {
                    if (err) return callback(err)
                    parseTicketStats(req.user.role, tickets, function (data) {
                        tags = data.tags

                        return callback(null, tickets)
                    })
                })
            },
            function (tickets, callback) {
                if (_.isEmpty(tickets)) return callback('Group has no tickets to report.')
                var today = moment()
                    .hour(23)
                    .minute(59)
                    .second(59)
                var r = {}
                r.ticketCount = _.size(tickets)
                tickets = _.sortBy(tickets, 'date')
                r.recentTickets = _.takeRight(tickets, 5)
                r.closedTickets = _.filter(tickets, function (v) {
                    return v.status === 3
                })

                var firstDate = moment(_.first(tickets).date).subtract(30, 'd')
                var diffDays = today.diff(firstDate, 'days')

                buildGraphData(tickets, diffDays, function (graphData) {
                    r.graphData = graphData

                    // Get average Response
                    buildAvgResponse(tickets, function (obj) {
                        if (_.isUndefined(obj)) {
                            return callback(null, r)
                        }

                        r.avgResponse = obj.avgResponse

                        return callback(null, r)
                    })
                })
            }
        ],
        function (err, results) {
            if (err) return res.status(400).json({ success: false, error: err })

            data.ticketCount = results.ticketCount
            data.recentTickets = results.recentTickets
            data.closedCount = _.size(results.closedTickets)
            data.graphData = results.graphData
            data.avgResponse = results.avgResponse
            data.tags = tags

            return res.json({ success: true, data: data })
        }
    )
}

/**
 * @api {get} /api/v1/tickets/stats/user/:user Get Ticket Stats For User
 * @apiName getTicketStatsForUser
 * @apiDescription Gets live ticket stats for given userId
 * @apiVersion 0.1.9
 * @apiGroup Ticket
 * @apiHeader {string} accesstoken The access token for the logged in user
 *
 * @apiExample Example usage:
 * curl -H "accesstoken: {accesstoken}" -l http://localhost/api/v1/tickets/stats/user/{userid}
 *
 * @apiError InvalidRequest Invalid Post Data
 *
 */
apiTickets.getTicketStatsForUser = function (req, res) {
    var userId = req.params.user
    if (userId === 0) return res.status(200).json({ success: false, error: 'Please Select User.' })
    if (_.isUndefined(userId)) return res.status(400).json({ success: false, error: 'Invalid User Id.' })

    var ticketModel = require('../../../models/ticket')
    var data = {}
    var tags = {}
    async.waterfall(
        [
            function (callback) {
                ticketModel.getTicketsByRequester(userId, function (err, tickets) {
                    if (err) return callback(err)
                    parseTicketStats(req.user.role, tickets, function (data) {
                        tags = data.tags

                        return callback(null, tickets)
                    })
                })
            },
            function (tickets, callback) {
                if (_.isEmpty(tickets)) return callback('User has no tickets to report.')
                var today = moment()
                    .hour(23)
                    .minute(59)
                    .second(59)
                var r = {}
                r.ticketCount = _.size(tickets)
                tickets = _.sortBy(tickets, 'date')
                r.recentTickets = _.takeRight(tickets, 5)
                r.closedTickets = _.filter(tickets, function (v) {
                    return v.status === 3
                })

                var firstDate = moment(_.first(tickets).date).subtract(30, 'd')
                var diffDays = today.diff(firstDate, 'days')

                buildGraphData(tickets, diffDays, function (graphData) {
                    r.graphData = graphData

                    // Get average Response
                    buildAvgResponse(tickets, function (obj) {
                        if (_.isUndefined(obj)) {
                            return callback(null, r)
                        }

                        r.avgResponse = obj.avgResponse

                        return callback(null, r)
                    })
                })
            }
        ],
        function (err, results) {
            if (err) return res.status(400).json({ success: false, error: err })

            data.ticketCount = results.ticketCount
            data.recentTickets = results.recentTickets
            data.closedCount = _.size(results.closedTickets)
            data.graphData = results.graphData
            data.avgResponse = results.avgResponse
            data.tags = tags

            return res.json({ success: true, data: data })
        }
    )
}

/**
 * @api {get} /api/v1/tickets/count/tags Get Tags Count
 * @apiName getTagCount
 * @apiDescription Gets cached count of all tags
 * @apiVersion 0.1.7
 * @apiGroup Ticket
 * @apiHeader {string} accesstoken The access token for the logged in user
 *
 * @apiExample Example usage:
 * curl -H "accesstoken: {accesstoken}" -l http://localhost/api/v1/tickets/count/tags
 *
 * @apiError InvalidRequest Invalid Post Data
 *
 */
apiTickets.getTagCount = function (req, res) {
    var cache = global.cache
    var timespan = req.params.timespan
    if (_.isUndefined(timespan) || _.isNaN(timespan)) timespan = 0

    if (_.isUndefined(cache)) {
        return res.status(400).send('Tag stats are still loading...')
    }

    var tags = cache.get('tags:' + timespan + ':usage')

    res.json({ success: true, tags: tags })
}

/**
 * @api {get} /api/v1/tickets/count/topgroups/:timespan/:topNum Top Groups Count
 * @apiName getTopTicketGroups
 * @apiDescription Gets the group with the top ticket count and timespan
 * @apiVersion 0.1.7
 * @apiGroup Ticket
 * @apiHeader {string} accesstoken The access token for the logged in user
 *
 * @apiExample Example usage:
 * curl -H "accesstoken: {accesstoken}" -l http://localhost/api/v1/tickets/count/topgroups/30/10
 *
 * @apiSuccess {array} items Array with Group name and Count
 *
 * @apiError InvalidPostData The data was invalid
 * @apiErrorExample
 *      HTTP/1.1 400 Bad Request
 {
     "error": "Invalid Request"
 }
 */
apiTickets.getTopTicketGroups = function (req, res) {
    var ticketModel = require('../../../models/ticket')
    var top = req.params.top
    var timespan = req.params.timespan

    ticketModel.getTopTicketGroups(timespan, top, function (err, items) {
        if (err) return res.status(400).json({ error: 'Invalid Request' })

        return res.json({ items: items })
    })
}

/**
 * @api {delete} /api/v1/tickets/:tid/attachments/remove/:aid Remove Attachment
 * @apiName removeAttachment
 * @apiDescription Remove Attachemtn with given Attachment ID from given Ticket ID
 * @apiVersion 0.1.0
 * @apiGroup Ticket
 * @apiHeader {string} accesstoken The access token for the logged in user
 *
 * @apiExample Example usage:
 * curl -X DELETE -H "accesstoken: {accesstoken}" -l http://localhost/api/v1/tickets/:tid/attachments/remove/:aid
 *
 * @apiSuccess {boolean} success Successfully?
 * @apiSuccess {object} ticket Ticket Object
 *
 * @apiError InvalidRequest Invalid Request
 * @apiError InvalidPermissions Invalid Permissions
 */
apiTickets.removeAttachment = function (req, res) {
    var ticketId = req.params.tid
    var attachmentId = req.params.aid
    if (_.isUndefined(ticketId) || _.isUndefined(attachmentId))
        return res.status(400).json({ error: 'Invalid Attachment' })

    // Check user perm
    var user = req.user
    if (_.isUndefined(user)) return res.status(400).json({ error: 'Invalid User Auth.' })

    var permissions = require('../../../permissions')
    if (!permissions.canThis(user.role, 'tickets:removeAttachment'))
        return res.status(401).json({ error: 'Invalid Permissions' })

    var ticketModel = require('../../../models/ticket')
    ticketModel.getTicketById(ticketId, function (err, ticket) {
        if (err) return res.status(400).send('Invalid Ticket Id')
        ticket.getAttachment(attachmentId, function (a) {
            ticket.removeAttachment(user._id, attachmentId, function (err, ticket) {
                if (err) return res.status(400).json({ error: 'Invalid Request.' })

                var fs = require('fs')
                var path = require('path')
                var dir = path.join(__dirname, '../../../../public', a.path)
                if (fs.existsSync(dir)) fs.unlinkSync(dir)

                ticket.save(function (err, t) {
                    if (err) return res.status(400).json({ error: 'Invalid Request.' })

                    res.json({ success: true, ticket: t })
                })
            })
        })
    })
}

/**
 * @api {put} /api/v1/tickets/:id/subscribe Subscribe/Unsubscribe
 * @apiName subscribeTicket
 * @apiDescription Subscribe/Unsubscribe user to the given ticket OID
 * @apiVersion 0.1.4
 * @apiGroup Ticket
 * @apiHeader {string} accesstoken The access token for the logged in user
 *
 * @apiExample Example usage:
 * curl -H "Content-Type: application/json" -H "accesstoken: {accesstoken}" -X PUT -d "{\"user\": {user},\"subscribe\": {boolean}}" -l http://localhost/api/v1/tickets/{id}
 *
 * @apiParamExample {json} Request-Example:
   {
       "user": {user},
       "subscribe": {boolean}
   }
 *
 * @apiSuccess {boolean} success Successfully?
 *
 * @apiError InvalidPostData Invalid Post Data
 */
apiTickets.subscribe = function (req, res) {
    var ticketId = req.params.id
    var data = req.body
    if (_.isUndefined(data.user) || _.isUndefined(data.subscribe))
        return res.status(400).json({ error: 'Invalid Post Data.' })

    var ticketModel = require('../../../models/ticket')
    ticketModel.getTicketById(ticketId, function (err, ticket) {
        if (err) return res.status(400).json({ error: 'Invalid Ticket Id' })

        async.series(
            [
                function (callback) {
                    if (data.subscribe) {
                        ticket.addSubscriber(data.user, function () {
                            callback()
                        })
                    } else {
                        ticket.removeSubscriber(data.user, function () {
                            callback()
                        })
                    }
                }
            ],
            function () {
                ticket.save(function (err) {
                    if (err) return res.status(400).json({ error: err })

                    emitter.emit('ticket:subscribers:update')

                    res.json({ success: true })
                })
            }
        )
    })
}

/**
 * @api {get} /api/v1/tickets/tags Get Ticket Tags
 * @apiName getTags
 * @apiDescription Gets all ticket tags
 * @apiVersion 0.1.6
 * @apiGroup Ticket
 * @apiHeader {string} accesstoken The access token for the logged in user
 *
 * @apiExample Example usage:
 * curl -H "accesstoken: {accesstoken}" -l http://localhost/api/v1/tickets/tags
 *
 * @apiSuccess {boolean} success Successfully?
 * @apiSuccess {boolean} tags Array of Tags
 *
 */
apiTickets.getTags = function (req, res) {
    var tagSchema = require('../../../models/tag')
    tagSchema.getTags(function (err, tags) {
        if (err) return res.status(400).json({ success: false, error: err })

        _.each(tags, function (item) {
            item.__v = undefined
        })

        res.json({ success: true, tags: tags })
    })
}

/**
 * @api {get} /api/v1/tickets/overdue Get Overdue Tickets
 * @apiName getOverdue
 * @apiDescription Gets current overdue tickets
 * @apiVersion 0.1.9
 * @apiGroup Ticket
 * @apiHeader {string} accesstoken The access token for the logged in user
 *
 * @apiExample Example usage:
 * curl -H "accesstoken: {accesstoken}" -l http://localhost/api/v1/tickets/overdue
 *
 * @apiSuccess {boolean} success Successfully?
 *
 */
apiTickets.getOverdue = function (req, res) {
    var settingSchema = require('../../../models/setting')
    settingSchema.getSettingByName('showOverdueTickets:enable', function (err, setting) {
        if (err) return res.status(400).json({ success: false, error: err.message })

        if (setting !== null && setting.value === false) {
            return res.json({
                success: true,
                error: 'Show Overdue currently disabled.'
            })
        }

        var ticketSchema = require('../../../models/ticket')
        var groupSchema = require('../../../models/group')
        groupSchema.getAllGroupsOfUser(req.user._id, function (err, grps) {
            if (err) return res.status(400).json({ success: false, error: err.message })
            grps = grps.map(function (g) {
                return g._id.toString()
            })
            ticketSchema.getOverdue(grps, function (err, objs) {
                if (err) return res.status(400).json({ success: false, error: err.message })

                var sorted = _.sortBy(objs, 'uid').reverse()

                return res.json({ success: true, tickets: sorted })
            })
        })
    })
}

apiTickets.getDeletedTickets = function (req, res) {
    var ticketSchema = require('../../../models/ticket')
    ticketSchema.getDeleted(function (err, tickets) {
        if (err) return res.status(500).json({ success: false, error: err })

        return res.json({ success: true, count: tickets.length, deletedTickets: tickets })
    })
}

apiTickets.restoreDeleted = function (req, res) {
    var postData = req.body
    if (!postData || !postData._id) return res.status(400).json({ success: false, error: 'Invalid Post Data' })
    var ticketSchema = require('../../../models/ticket')
    ticketSchema.restoreDeleted(postData._id, function (err) {
        if (err) return res.status(500).json({ success: false, error: err })

        return res.json({ success: true })
    })
}

module.exports = apiTickets
