var expect = require('chai').expect

var hbsHelpers = require('../../src/helpers/hbs/helpers')

describe('Handlebars Helpers', function () {
  it('should return status name', function (done) {
    var strNew = hbsHelpers.helpers.statusName(0)
    var strOpen = hbsHelpers.helpers.statusName(1)
    var strDevelopment = hbsHelpers.helpers.statusName(2)
    var strClosed = hbsHelpers.helpers.statusName(3)
    var strWaitingForInfo = hbsHelpers.helpers.statusName(4)
    var str2Line = hbsHelpers.helpers.statusName(5)
    var strPlanning = hbsHelpers.helpers.statusName(6)
    var strIntervention = hbsHelpers.helpers.statusName(7)
    var strDefault = hbsHelpers.helpers.statusName()

    expect(strNew).to.equal('New')
    expect(strOpen).to.equal('Open')
    expect(strDevelopment).to.equal('Develoment')
    expect(strClosed).to.equal('Closed')
    expect(strWaitingForInfo).to.equal('Waiting for info')
    expect(str2Line).to.equal('2nd line')
    expect(strPlanning).to.equal('Planning')
    expect(strIntervention).to.equal('Intervention')
    expect(strDefault).to.equal('New')

    done()
  })
})
