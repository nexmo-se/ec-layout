var socket = io("https://neru-d0cab68b-debug-debug.apse1.serverless.vonage.com", { path: "/socket.io" });

var apiKey, sessionId, token, roomName, roomId, roomArchiveInfo, roomLayoutInfo;
var videos = [], experienceComposer;

var joinedRoom = false;
var MAX_LAYOUT_TYPE = 3, layoutType = 1, videosLayout = [];

// --------------------

// Get roomId from query params
const queryParams = new Proxy(new URLSearchParams(window.location.search), {
  get: (searchParams, prop) => searchParams.get(prop),
});
var { roomId } = queryParams;
console.log(queryParams);

if (roomId) {
  joinRoom();
  init();
}

// --------------------

// Handling all of our errors here by alerting them
function handleError(error) {
  if (error) {
    console.error('handleError error', error);
    alert(error.message ? error.message : error);
  }
}

// Join socket.io room to receive events
function joinRoom() {
  console.log("Joining room ", roomId);
  socket.emit('join:room', { roomId });
  joinedRoom = true;
}

function init() {
  axios.post(`/init/recorder-page`, { roomId })
  .then(result => {
    console.log(`/init/recorder-page | `, result);
    if (result.status === 200) {
      apiKey = result.data ? result.data.apiKey : "";
      sessionId = result.data ? result.data.sessionId : "";
      token = result.data ? result.data.token : "";
      roomName = result.data ? result.data.roomName : "";
      roomId = result.data ? result.data.roomId : "";
      roomArchiveInfo = result.data ? result.data.roomArchiveInfo : null;
      roomLayoutInfo = result.data ? result.data.roomLayoutInfo : null;
      if (roomLayoutInfo) {
        layoutType = roomLayoutInfo.layoutType;
        videosLayout = roomLayoutInfo.videosLayout;
      }

      subscribeToSession();
    } else {
      handleError(result);
    }
  })
  .catch(handleError);
}

function subscribeToSession() {
  console.log("subscribeToSession");
  var session = OT.initSession(apiKey, sessionId);

  session.connect(token, function(error) {
    if (error) {
      handleError(error);
    } else {
      console.log("SESSION CONNECT SUCCESS")
    }
  });

  session.on('streamCreated', function(event) {
    console.log("STREAM CREATED", event);

    if (event.stream.name !== "EC-Layout-Recorder") {
      let subscriber = session.subscribe(event.stream, 'layoutContainer', {
        insertMode: 'append',
        width: '40%',
        height: '40%'
      }, handleError);

      console.log("subscriber", subscriber.stream.streamId);
      videos.push(subscriber);

      let streamId = subscriber.stream ? subscriber.stream.streamId : subscriber.streamId;
      if (!videosLayout.includes(streamId)) {
        videosLayout.push(streamId);
        updateLayout();
      }

      console.log("videos", videos);
      console.log("videosLayout", videosLayout);
    }
  });

  session.on('streamDestroyed', (event) => {
    console.log("STREAM DESTROYED", event);
    
    event.preventDefault();
    session.getSubscribersForStream(event.stream).forEach((subscriber) => {
      subscriber.element.classList.remove('ot-layout');
      setTimeout(() => {
        subscriber.destroy();

        applyLayoutType();
      }, 200);
    });
  });
}

async function applyLayoutType() {
  console.log("applyLayoutType | videosLayout: ", videosLayout);
  if (videosLayout.length === 0) return;

  let reorganizedVideos = [];
  videosLayout.forEach((vl) => {
    videos.forEach((vid) => {
      if (vid.streamId === vl) reorganizedVideos.push(vid);
    });
  });
  console.log("videosLayout", videosLayout);
  console.log("reorganizedVideos", reorganizedVideos);

  let layoutContainer = document.getElementById("layoutContainer");
  if (layoutType === 1) {
    for(let i = 0; i < reorganizedVideos.length; i++) {
      reorganizedVideos[i].element.style.width = `40%`;
      reorganizedVideos[i].element.style.height = `40%`;
    }

    layoutContainer.classList.add("layout1");
    layoutContainer.classList.remove("layout2");
    layoutContainer.classList.remove("layout3");
  } else if (layoutType === 2) {
    for(let i = 0; i < reorganizedVideos.length; i++) {
      reorganizedVideos[i].element.style.width = `20%`;
      reorganizedVideos[i].element.style.height = `20%`;
    }

    layoutContainer.classList.remove("layout1");
    layoutContainer.classList.add("layout2");
    layoutContainer.classList.remove("layout3");
  } else if (layoutType === 3) {
    for(let i = 0; i < reorganizedVideos.length; i++) {
      reorganizedVideos[i].element.style.width = `100%`;
      reorganizedVideos[i].element.style.height = `100%`;
    }

    layoutContainer.classList.remove("layout1");
    layoutContainer.classList.remove("layout2");
    layoutContainer.classList.add("layout3");
  }
}

// Call the layout method any time the size of the layout container changes
var resizeTimeout;
window.onresize = function() {
  if (layoutType !== 1) return;

  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(function () {
    layout.layout();
  }, 20);
};

// --------------------

// Listen to socket events
socket.on('join:room', (data) => {
  console.log("join:room", data);
});
socket.on('event', (data) => {
  console.log("event", data);
  if (!joinedRoom) return;

  if (data.type === "archiveUpdate") {
    roomArchiveInfo = data.archiveInfo;
    experienceComposer = data.experienceComposer;
    refreshArchiveButton();
  } else if (data.type === "layoutUpdate") {
    roomLayoutInfo = data.layoutInfo;
    layoutType = data.layoutInfo.layoutType;
    videosLayout = data.layoutInfo.videosLayout;
    applyLayoutType();
  } else if (data.type === "layoutChange") {
    layoutType = data.layoutType;
    applyLayoutType();
  }
});
socket.on('notification', (data) => {
  console.log("notification", data);
});