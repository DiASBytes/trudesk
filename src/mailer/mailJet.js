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
                            "Subject": `Your ticket #${ticket.uid} is in process`,
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
                            "Subject": `Your ticket #${ticket.uid} has been updated`,
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
    }
};