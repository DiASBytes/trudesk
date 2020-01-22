require('dotenv').config()

var axios = require('axios')
var moment = require('moment')
var settings = require('../models/setting')
var mailJet = require('./mailJet')

var { TRUDESK_ACCESS_TOKEN, APPLICATION_URL } = process.env;

var mailReport = {}

mailReport.send = function () {
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
                    url: `${APPLICATION_URL}api/v1/reports/generate/tickets_weekly_report`,
                    headers: {
                        'Content-Type': 'application/json',
                        'accessToken': `${TRUDESK_ACCESS_TOKEN}`
                    },
                    method: 'POST',
                    data: {
                        startDate: moment().subtract(10, "weeks").format('MM-DD-YYYY'),
                        endDate: moment().format('MM-DD-YYYY'),
                        groups: ['-1'],
                        status: ['0', '1', '2']
                    }
                })
                    .then(function (response) {
                        if (response && response.data) {
                            mailJet.sendWeeklyReport(emails.value, response.data);
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