const config = require('../../config/config');
const mailjet = require('node-mailjet').connect(config.mailjet.public, config.mailjet.private);

module.exports = {
    sendTicketCreated: (ticket, emails) => {
        return new Promise(async (resolve, reject) => {
            try {
                await mailjet.post('send', { 'version': 'v3.1' }).request({
                    "Messages": [
                        {
                            "From": {
                                "Email": config.mailjet.fromEmail,
                                "Name": 'DiASBytes Support'
                            },
                            "To": [
                                {
                                    "Email": ticket.owner.email,
                                    "Name": (() => {
                                        if (ticket.owner.fullname) {
                                            return ticket.owner.fullname;
                                        } else {
                                            return ticket.owner.email;
                                        }
                                    })()
                                }
                            ],
                            "TemplateID": 779007,
                            "TemplateLanguage": true,
                            "Subject": `New ticket #${ticket.uid}: ${ticket.subject}`,
                            "Variables": {
                                "uid": ticket.uid,
                                "subject": ticket.subject,
                                "issue": ticket.issue
                            }
                        }
                    ]
                });
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    },
    sendCommentAdded: (ticket, comments, emails) => {
        return new Promise(async (resolve, reject) => {
            try {
                await mailjet.post('send', { 'version': 'v3.1' }).request({
                    "Messages": [
                        {
                            "From": {
                                "Email": config.mailjet.fromEmail,
                                "Name": 'DiASBytes Support'
                            },
                            "To": [
                                {
                                    "Email": ticket.owner.email,
                                    "Name": (() => {
                                        if (ticket.owner.fullname) {
                                            return ticket.owner.fullname;
                                        } else {
                                            return ticket.owner.email;
                                        }
                                    })()
                                }
                            ],
                            "TemplateID": 779757,
                            "TemplateLanguage": true,
                            "Subject": `Ticket #${ticket.uid} updated: ${ticket.subject}`,
                            "Variables": {
                                "ticket": ticket,
                                "comments": comments
                            }
                        }
                    ]
                });
                resolve();
            } catch (error) {
                reject(error);
            }
        });
    },
    sendTicketAssignee: (ticket, user) => {
        return new Promise(async (resolve, reject) => {
            try {
                await mailjet.post('send', { 'version': 'v3.1' }).request({
                    "Messages": [
                        {
                            "From": {
                                "Email": config.mailjet.fromEmail,
                                "Name": 'DiASBytes Support'
                            },
                            "To": [
                                {
                                    "Email": user.email,
                                    "Name": user.fullname
                                }
                            ],
                            "TemplateID": 1074477,
                            "TemplateLanguage": true,
                            "Subject": `Nieuw ticket toegewezen`,
                            "Variables": {
                                "ticket": ticket,
                                "user": user
                            }
                        }
                    ]
                });
                resolve();
            } catch (error) {
                console.log({ error });

                reject(error);
            }
        });
    },
};