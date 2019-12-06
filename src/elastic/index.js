var Elastic = require('@elastic/elasticsearch');

const client = new Elastic.Client({
    cloud: {
        id: "diasonline-dev:ZXVyb3BlLXdlc3QxLmdjcC5jbG91ZC5lcy5pbyQwMDVmNmU5ODZhY2U0NDdjOTRmMmQ4YmNhNzk4ZjI2ZSRmYjk2ZmE3NjU5NTk0NDMwOTU2MWQ1MGExZGY3OWFmMg==",
        username: "elastic",
        password: "nx2tfezToxc1ls6dZw9qwLhS"
    }
});

module.exports = client;