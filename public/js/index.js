// var socket = io("https://neru-d0cab68b-debug-debug.apse1.serverless.vonage.com", { path: "/socket.io" });
var socket = io("https://neru-d0cab68b-ec-layout-dev.apse1.serverless.vonage.com", { path: "/socket.io" });

// Essential variables
var apiKey, sessionId, token, roomName, roomId, roomArchiveInfo, roomLayoutInfo;
var experienceComposer;
var veRoom;

var videoOn = "ON", recording = "OFF";
var changePublishVideoButton, recordVideoButton, downloadArchivesButton;
var DEFAULT_NOTIFY_TIMEOUT = 5000, notificationShown = false;

var joinedRoom = false;
var MAX_LAYOUT_TYPE = 2, layoutType = 1, videosLayout = [];

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
    document.getElementById("controls").classList.remove("hide");
}

// --------------------

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
    let innerHTML = archiveListCount > 0 ? "" : "No archive records for this room.";
  
    archiveList.forEach((archive) => {
        innerHTML += `<div class='archive-item'>${new Date(archive.createdAt)} | ${archive.resolution} |  <i>${archive.status}</i>`;
        if (archive.status.toLowerCase() === "available") {
            innerHTML += ` | <a href='${archive.url}' target='_blank'><b>Download</b></a>`;
        }
        innerHTML += `</div>`;
    });
    if (archiveList && archiveList.length < archiveListCount) {
        innerHTML += "<button onclick='loadMoreArchives()'>Load More</button>";
    }
    console.log({innerHTML});
    
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

changePublishVideoButton = document.getElementById('change-publish-video');
changePublishVideoButton.onclick = function() {
    let prevVideoOn = videoOn;
    videoOn = videoOn === "ON" ? "OFF" : "ON";
    if(videoOn === "ON" ? veRoom.camera.enableVideo() : veRoom.camera.disableVideo());

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
    if (!experienceComposer.id) {
        console.log("Not allowed to stop recording!");
        return;
    }
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

// --------------------

// Handling all of our errors here by alerting them
function handleError(error) {
    if (error) {
        console.error('handleError error', error);
        alert(error.message ? error.message : error);
    }
}

function initializeSession() {
    veRoom = new VideoExpress.Room({
    apiKey, sessionId, token,
    participantName: nameElem.value,
    roomContainer: "roomContainer",
    managedLayoutOptions: {
        layoutMode: "grid"
    }
    });
    console.log("initializeSession", {veRoom});

    veRoom.join({
        publisherProperties: {
            resolution: "1920x1080"
        }
    });

    veRoom.on('connected', () => {
        console.log('Connected');
    });

    veRoom.on('participantJoined', (participant) => {
        console.log('participant joined: ', participant);

        console.log(veRoom);
        console.log(veRoom.participants);
    });
}

// --------------------

// Detect keypress: "l" and notify room
document.addEventListener("keypress", async function(event) {
    ++layoutType;
    if (layoutType > MAX_LAYOUT_TYPE) layoutType = 1;
    await applyLayoutType();
    await notify("event", {
        type: "layoutChange",
        layoutType
    });
});

// Change layout type of video express
async function applyLayoutType() {
    console.log("applyLayoutType", {layoutType});
    if (layoutType === 1) {
        veRoom.setLayoutMode('grid');
    } else if (layoutType === 2) {
        veRoom.setLayoutMode('active-speaker');
    }
    return;
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

// --------------------

// Hide Experience Composer publisher
var observer = new MutationObserver(function(mutationsList) {
    // Loop through the mutations
    for (var i = 0; i < mutationsList.length; i++) {
      var mutation = mutationsList[i];
  
      // Check if nodes were added to the DOM
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // New element(s) added to the DOM
        var addedElement = mutation.addedNodes[0];
        if(addedElement instanceof Element){
          if(addedElement.classList.contains("MP_subscriber_overlay")){
            console.log("New element added:", addedElement);
            //get parent
            var parentElement = addedElement.parentNode;
            var h1Element = parentElement.querySelector('h1');
            console.log("h1Element.innerHTML", h1Element.innerHTML);
            if(h1Element != null && (h1Element.innerHTML == 'ecomposer') || h1Element.innerHTML == 'ecrecorder'){
              //alert("found it");
              parentElement.style.display='none';
              parentElement.remove();
              applyLayoutType();
            }
          }
        }
      }
    }
  });
  
  // Start observing changes in the DOM
  observer.observe(document, { childList: true, subtree: true });

// --------------------

// Join socket.io room to receive events
function joinRoom() {
    console.log("Joining room ", roomId);
    socket.emit('join:room', { roomId });
    joinedRoom = true;
}

// Listen to socket events
socket.on('event', (data) => {
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