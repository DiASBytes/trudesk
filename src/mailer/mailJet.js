const config = require('../../config/config');
const mailjet = require('node-mailjet').connect(config.mailjet.public, config.mailjet.private);
const base64 = require('base-64');

module.exports = {
    sendTicketCreated: (ticket) => {
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
                            "TemplateID": 1196217,
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
    sendClosedTicket: (ticket, billingData, emails) => {
        return new Promise(async (resolve, reject) => {
            try {
                const respondents = emails.split(',').map((email) => ({
                    "Email": email.trim()
                }));

                await mailjet.post('send', { 'version': 'v3.1' }).request({
                    "Messages": [
                        {
                            "From": {
                                "Email": config.mailjet.fromEmail,
                                "Name": 'DiASBytes Support'
                            },
                            "To": respondents,
                            "TemplateID": 1190306,
                            "TemplateLanguage": true,
                            "Subject": `Closed: Ticket #${ticket.uid} - ${ticket.subject}`,
                            "Variables": {
                                "ticket": ticket,
                                "data": billingData
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
    sendWeeklyReport: (emails, content) => {
        return new Promise(async (resolve, reject) => {
            try {
                const respondents = emails.split(',').map((email) => ({
                    "Email": email
                }));

                await mailjet.post('send', { 'version': 'v3.1' }).request({
                    "Messages": [
                        {
                            "From": {
                                "Email": config.mailjet.fromEmail,
                                "Name": 'DiASBytes Support'
                            },
                            "To": respondents,
                            "TemplateID": 1190514,
                            "TemplateLanguage": true,
                            "Subject": `Weekly report`,
                            "Attachments": [{
                                "Filename": "report.csv",
                                "ContentType": "text/csv",
                                "Base64Content": base64.encode(content)
                            }]
                        }
                    ]
                });

                resolve();
            } catch (error) {
                reject(error);
            }
        });
    },
    sendTicketUpdateAssignee: (ticket, user) => {
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
                            "TemplateID": 1191220,
                            "TemplateLanguage": true,
                            "Subject": `Update op ticket #${ticket.uid}`,
                            "Variables": {
                                "ticket": ticket,
                                "user": user
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
};