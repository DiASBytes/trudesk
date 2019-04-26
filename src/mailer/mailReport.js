require('dotenv').config()

var path = require('path')
var mailer = require('./')
var axios = require('axios')
var moment = require('moment')
var Email = require('email-templates')
var templateDir = path.resolve(__dirname, '..', 'mailer', 'templates')
var settings = require('../models/setting')

var { TRUDESK_ACCESS_TOKEN, APPLICATION_URL } = process.env;
var mailReport = {}

mailReport.send = function() {
    settings.getSettingByName('onWeeklyReport:enable', function (err, setting) {
        if (err) {
            return console.log(err)
        }
        
        if (setting && setting.value === true) {
            settings.getSettingByName('onWeeklyReportEmails', function (err, emails) {
                if (err) {
                    return console.log(err)
                }

                axios({
                    url:`${APPLICATION_URL}/api/v1/reports/generate/tickets_by_status`,
                    headers: { 
                        'Content-Type': 'application/json',
                        'accessToken': `${TRUDESK_ACCESS_TOKEN}`
                    },
                    method: 'POST',
                    data: {
                        startDate: '01-01-2019',
                        endDate: moment().format('MM-DD-YYYY'),
                        groups: ['-1'],
                        status: ['0', '1', '2']
                    }
                })
                .then(function (response) {
                    if(response && response.data) {
                        var email = new Email({
                            views: {
                                root: templateDir,
                                options: {
                                    extension: 'handlebars'
                                }
                            }
                        })
            
                        email
                            .render('weekly-report')
                            .then(function (html) {
                                var mailOptions = {
                                    to: emails.value,
                                    subject: 'Weekly report',
                                    html: html,
                                    generateTextFromHTML: true,
                                    attachments: [
                                        {
                                            filename: 'report.csv',
                                            content: response.data
                                        }
                                    ]
                                }
            
                                mailer.sendMail(mailOptions, function (err) {
                                    if (err) {
                                        console.log('err', err);
                                    }
                                })
                            })
                            .catch(function (err) {
                                console.log('err', err);
                            });
                    }
                })
                .catch(function (error) {
                    console.log(error);
                });
            })
        }
    })
};

module.exports = mailReport