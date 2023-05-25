This app launches a simple multi-party video conference, where we will showcase how one can use Experience Composer to play a video file and publish it in the stream for everyone to see.

## 📚 Dependencies
- [Vonage Video API](https://www.vonage.com/communications-apis/video/)
- [Experience Composer](https://tokbox.com/developer/guides/experience-composer/)
- [opentok-layout-js](https://github.com/aullman/opentok-layout-js)

## 🛠 Setup
1. Create a [Tokbox account](https://tokbox.com/account/) and create a new project with the type "Vonage Video API".
2. Enable Experience Composer in your account. Then, under Project Settings, find Experience Composer and click Configure. 
3. Make sure `.env` file exists on root folder (format is inside `.env.example`). Content of the file should filled in accordingly.

## ▶️ Run Project
- Execute: `npm i`
- Execute: `node server.js`
- OpenTok requires https, so for testing purposes, setup a [ngrok tunnel](https://ngrok.com/). Open the URL accordingly.
