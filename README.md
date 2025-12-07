# web-push-testing
A server that can be run to test against a mocked API endpoint for web push without relying on flaky browser drivers.

The idea for this was inspired by see, using, and giving up on https://github.com/GoogleChromeLabs/web-push-testing-service.

[![Test](https://github.com/marc1706/web-push-testing/actions/workflows/tests.yml/badge.svg)](https://github.com/marc1706/web-push-testing/actions/workflows/tests.yml)
[![Coverage Status](https://coveralls.io/repos/github/marc1706/web-push-testing/badge.svg?branch=main)](https://coveralls.io/github/marc1706/web-push-testing?branch=main)

## Features
- Provides test solution to test both the web application and the notification endpoint part of the [Push API](https://www.w3.org/TR/push-api/)
- Full support for:
  - Subscribing to push messages
  - Sending push messages
  - Retrieving push messages received by endpoint
- Supports aesgcm & aes128gcm type of push messages
- Fully runs on localhost as HTTP server
- Fast & reliable
- Fully tested

## Installation
`web-push-testing` can be installed directly via npm. It requires node `>=20.0.0`:
```
npm install web-push-testing
```

## Usage
#### Starting the server:
```
web-push-testing start
```

#### Stopping the server:
```
web-push-testing stop
```

*Note: web-push-testing will default to port `8090`*

*Note: Multiple instances will require using a different port*

#### Setting the port:
```
web-push-testing --port 8990 start
```

#### Get all supported command line arguments:
```
web-push-testing --help
```

## API
See the documentation under *Further Reading* in regard to input & output formats.
Additional fields are specified in square brackets.

#### Status
- URL: `http://localhost:8090/status`
- Input: No input
- Output:
  - Status: 200
  - No body

#### Subscribe
- URL: `http://localhost:8090/subscribe`
- Input: `PushSubscriptionOptions`
- Output:
  ```
  {
      data: PushSubscriptionJSON[+clientHash]
  }
  ```

#### Expire subscription
- URL: `http://localhost:8090/expire-subscription/[+clientHash]`
- Input: None (expect for clientHash in URL)
- Output:
  - Status:
    - 200 for success
    - 400 on error e.g. when subscription does not exist
  - Body:
    - None for success
    - Error return on error

#### Send push notification
- URL: `PushSubscriptionJSON.endpoint` (format: `http://localhost:8090/notify/[+clientHash]`)
- Headers: See e.g. [RFC 8291](https://datatracker.ietf.org/doc/html/rfc8291) on required headers
- Input: Encrypted payload
- Output:
  - Status:
    - 201 for success
    - 400 on errors
    - 410 on expired subscriptions
  - Body
    - Error:
      ```
      {
          error: { message: err.message }
      }
      ```
    - Expired subscription:
      ```
      {
          reason: 'Push subscription has unsubscribed or expired.',
      }
      ```

#### Get endpoint notifications
- URL: `http://localhost:8090/get-notifications`
- Input:
  ```
  {"clientHash": "YOUR_CLIENT_HASH"}
  ```
- Output:
  - Status: 200, 400 on invalid `clientHash`
  - Body:
    ```
    {
      "data": {
        "messages": [
          message1,
          message2,
          ...
        ]
      }
    }
    ```

## Further reading
- [Push API W3C Working Draft](https://www.w3.org/TR/push-api/)
- [Push API | MDN](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)
- [RFC 8030](https://datatracker.ietf.org/doc/html/rfc8030)
- [RFC 8291](https://datatracker.ietf.org/doc/html/rfc8291)
- [VAPID draft](https://datatracker.ietf.org/doc/html/draft-thomson-webpush-vapid)
