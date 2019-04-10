#!/bin/bash

if [ ! -d /usr/src/trudesk/public/uploads/users ]; then
    echo "Creating Directory..."
    mkdir /root/trudesk/public/uploads/users
fi

if [ ! -f /usr/src/trudesk/public/uploads/users/defaultProfile.jpg ]; then
    echo "Coping defaultProfile.jpg"
    cp /root/trudesk/public/img/defaultProfile.jpg /usr/src/trudesk/public/uploads/users/defaultProfile.jpg
fi

node /usr/src/trudesk/runner.js