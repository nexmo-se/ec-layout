var socket = io("https://neru-d0cab68b-debug-debug.apse1.serverless.vonage.com", { path: "/socket.io" });

// Essential variables
var apiKey, sessionId, token, roomName, roomId, roomArchiveInfo, roomLayoutInfo;
var publisher, videos = [], experienceComposer;

var videoOn = "ON", audioOn = "ON", recording = "OFF";
var changePublishAudioButton, changePublishVideoButton, recordVideoButton, downloadArchivesButton;
var DEFAULT_NOTIFY_TIMEOUT = 5000, notificationShown = false;

var joinedRoom = false;
var MAX_LAYOUT_TYPE = 3, layoutType = 1, videosLayout = [];

var archiveListPage = 1, archiveList = [], archiveListCount = 0;

// --------------------

const nameElem = document.getElementById("name");
const roomElem = document.getElementById("roomName");

function login() {
  console.log(nameElem.value, roomElem.value);
  axios.post(`/init`, { name: nameElem.value, roomName: roomElem.value })
  .then(result => {
    console.log(`/init | `, result);
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

      // start video call
      initializeSession();

      // join room to receive events
      joinRoom();

      // update UI
      hideLogin();
      refreshArchiveButton();
    } else {
      handleError(result);
    }
  })
  .catch(handleError);
}

function hideLogin() {
  document.getElementById("login").classList.add("hide");
  document.getElementById("layoutContainer").classList.remove("hide");
  document.getElementById("controls").classList.remove("hide");
}

function refreshArchiveButton() {
  if (!roomArchiveInfo || (roomArchiveInfo.status !== "pending" && roomArchiveInfo.status !== "starting" && roomArchiveInfo.status !== "ongoing")) {
    document.getElementById("record-on").classList.add("hide");
    document.getElementById("record-off").classList.remove("hide");
    recording = "OFF";
  } else {
    document.getElementById("record-on").classList.remove("hide");
    document.getElementById("record-off").classList.add("hide");
    recording = "ON";
  }
}

function constructArchiveList() {
  let innerHTML = archiveList ? "" : "No archive records for this room.";

  archiveList.forEach((archive) => {
    innerHTML += `<div class='archive-item'>${new Date(archive.createdAt)} | ${archive.resolution} |  ${archive.status} | <a href='${archive.url}' target='_blank'>Download</a></div>`;
  });
  if (archiveList && archiveList.length < archiveListCount) {
    innerHTML += "<button onclick='loadMoreArchives()'>Load More</button>";
  }
  
  document.getElementById("archive-list-content").innerHTML = innerHTML;
}

function loadMoreArchives() {
  ++archiveListPage;
  listArchives();
}

function listArchives() {
  axios.post(`/list/archive`, { page: archiveListPage, sessionId })
  .then(result => {
    console.log(`/list/archive |`, result);
    if (result.status === 200) {
      archiveList = result.data ? archiveList.concat(result.data.items) : [];
      archiveListCount = result.data ? result.data.count : 0;
      archiveListPage = result.data ? result.data.page : 1;

      constructArchiveList();
    } else {
      handleError(result);
    }
  })
  .catch(handleError);
}

// --------------------

changePublishAudioButton = document.getElementById('change-publish-audio');
changePublishAudioButton.onclick = function() {
  let prevAudioOn = audioOn;
  audioOn = audioOn === "ON" ? "OFF" : "ON";
  publisher.publishAudio(audioOn === "ON" ? true : false);

  var element1 = document.getElementById(`audio-${audioOn.toLowerCase()}`);
  element1.classList.remove("hide");
  var element2 = document.getElementById(`audio-${prevAudioOn.toLowerCase()}`);
  element2.classList.add("hide");
}

changePublishVideoButton = document.getElementById('change-publish-video');
changePublishVideoButton.onclick = function() {
  let prevVideoOn = videoOn;
  videoOn = videoOn === "ON" ? "OFF" : "ON";
  publisher.publishVideo(videoOn === "ON" ? true : false);

  var element1 = document.getElementById(`video-${videoOn.toLowerCase()}`);
  element1.classList.remove("hide");
  var element2 = document.getElementById(`video-${prevVideoOn.toLowerCase()}`);
  element2.classList.add("hide");
}

recordVideoButton = document.getElementById('record-on-off');
recordVideoButton.onclick = function() {
  recording = recording === "ON" ? "OFF" : "ON";
  
  if (recording === "ON") {
    axios.post(`/start-ec`, { roomName, sessionId })
    .then(result => {
      console.log(`/start-ec |`, result);
      if (result.status === 200) {
        experienceComposer = result.data ? result.data.experienceComposer : "";
        roomArchiveInfo = result.data ? result.data.archiveInfo : null;

        refreshArchiveButton();
      } else {
        handleError(result);
      }
    })
    .catch(handleError);
  } else {
    let ecId = experienceComposer.id ? experienceComposer.id : roomArchiveInfo.ecId;
    axios.post(`/stop-ec`, { ecId, sessionId })
    .then(result => {
      console.log(`/stop-ec |`, result);
      if (result.status === 200) {
        experienceComposer = null;
        roomArchiveInfo = null;

        refreshArchiveButton();
      } else {
        handleError(result);
      }
    })
    .catch(handleError);
  }
}

var modal = document.getElementById("archive-list");
var span = document.getElementById("archive-list-close");

downloadArchivesButton = document.getElementById('download');
downloadArchivesButton.onclick = function() {
  listArchives();
  modal.style.display = "block";
}

span.onclick = function() {
  modal.style.display = "none";
  archiveListPage = 1;
  archiveList = [];
  archiveListCount = 0;
}

// When the user clicks anywhere outside of the modal, close it
window.onclick = function(event) {
  if (event.target == modal) {
    modal.style.display = "none";
    archiveListPage = 1;
    archiveList = [];
    archiveListCount = 0;
  }
}

// --------------------

// Handling all of our errors here by alerting them
function handleError(error) {
  if (error) {
    console.error('handleError error', error);
    alert(error.message ? error.message : error);
  }
}

// Initialize OpenTok session, publish video/audio
function initializeSession(videoSource) {
  console.log("initializeSession");
  var session = OT.initSession(apiKey, sessionId);

  publisher = OT.initPublisher('layoutContainer', {
    insertMode: 'append',
    width: '40%',
    height: '40%',
    style: {
      buttonDisplayMode: 'off'
    },
    publishAudio: audioOn,
    publishVideo: videoOn
  }, (error) => {
    handleError(error);

    setTimeout(() => {
      console.log("publisher", publisher);
      videos.push(publisher);

      let streamId = publisher.stream ? publisher.stream.streamId : publisher.streamId;
      if (!videosLayout.includes(streamId)) {
        videosLayout.push(streamId);
        updateLayout();
      }
      
      console.log("videos", videos);
      console.log("videosLayout", videosLayout);

      applyLayoutType();
    }, 2000);
  });

  session.connect(token, function(error) {
    if (error) {
      handleError(error);
    } else {
      console.log("SESSION CONNECT SUCCESS")
      session.publish(publisher, handleError);

      // applyLayoutType();
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

      applyLayoutType();
    }
  });

  session.on('streamDestroyed', (event) => {
    console.log("STREAM DESTROYED", event);

    event.preventDefault();
    session.getSubscribersForStream(event.stream).forEach((subscriber) => {
      subscriber.element.classList.remove('ot-layout');

      let streamId = subscriber.stream ? subscriber.stream.streamId : subscriber.streamId;
      console.log("subscriber.streamId", streamId);
      let idx = -1;
      videos.forEach((vid, i) => {
        if (streamId === vid.streamId) {
          idx = i;
        }
      });
      if (idx > -1) videos.splice (idx, 1);
      console.log("videos", videos);

      console.log("streamId", streamId);
      if (videosLayout.includes(streamId)) {
        const index = videosLayout.indexOf(streamId);
        if (index > -1) { // only splice array when item is found
          videosLayout.splice(index, 1); // 2nd parameter means remove one item only
        }
        console.log("videosLayout", videosLayout);
        updateLayout();
      }

      setTimeout(() => {
        subscriber.destroy();

        applyLayoutType();
      }, 200);
    });
  });
}

// Join socket.io room to receive events
function joinRoom() {
  console.log("Joining room ", roomId);
  socket.emit('join:room', { roomId });
  joinedRoom = true;
}

// Notify / broadcast to all users in a room
async function notify(eventName, data) {
  axios.post(`/notify`, { roomId, eventName, data })
  .then(result => {
    console.log(`/notify | `, result);
    if (result.status === 200) {
      console.log("Notified room");
    } else {
      handleError(result);
    }
  })
  .catch(handleError);
}

// Update the video layout for the room to server
async function updateLayout() {
  axios.post(`/update/layout`, { roomName, layoutInfo: { layoutType, videosLayout } })
  .then(result => {
    console.log(`/update/layout | `, result);
    if (result.status === 200) {
      console.log("Layout updated");
    } else {
      handleError(result);
    }
  })
  .catch(handleError);
}

async function applyLayoutType() {
  // console.log("applyLayoutType | videosLayout: ", videosLayout);
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
      reorganizedVideos[i].element.style.width = `90%`;
      reorganizedVideos[i].element.style.height = `90%`;
    }

    layoutContainer.classList.remove("layout1");
    layoutContainer.classList.remove("layout2");
    layoutContainer.classList.add("layout3");
  }
}

// Call the layout method any time the size of the layout container changes
// var resizeTimeout;
// window.onresize = function() {
//   if (layoutType !== 1) return;

//   clearTimeout(resizeTimeout);
//   resizeTimeout = setTimeout(function () {
//     // layout.layout();
//   }, 20);
// };

// --------------------

// Detect keypress: "l" and notify room
document.addEventListener("keypress", async function(event) {
  if (roomId && joinedRoom && event.key === "l") {
    ++layoutType;
    if (layoutType > MAX_LAYOUT_TYPE) layoutType = 1;
    await notify("event", {
      type: "layoutChange",
      layoutType
    });
    await applyLayoutType();
  }
});

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
  if (!data.message) {
    return;
  }

  console.log("notification", data);
  var notificationElem = document.getElementById("notification");
  notificationElem.innerHTML = `<span>${data.message}</span>`;
  notificationElem.classList.remove("hide");
  notificationShown = true;

  setTimeout(() => {
    notificationElem.innerHTML = ``;
    notificationElem.classList.add("hide");
    notificationShown = false;
  }, data.timeout ? data.timeout : DEFAULT_NOTIFY_TIMEOUT);
});