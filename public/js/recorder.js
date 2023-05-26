// var socket = io("https://neru-d0cab68b-debug-debug.apse1.serverless.vonage.com", { path: "/socket.io" });
var socket = io("https://neru-d0cab68b-ec-layout-dev.apse1.serverless.vonage.com", { path: "/socket.io" });

// Essential variables
var apiKey, sessionId, token, roomName, roomId, roomArchiveInfo, roomLayoutInfo;
var experienceComposer;
var veRoom;

var joinedRoom = false;
var MAX_LAYOUT_TYPE = 2, layoutType = 1;

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

async function getVideoSource() {
    let canvas = document.createElement("canvas");
    let ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    const imgblob = await fetch(`/assets/vonage.png`)
        .then(r => r.blob());
    const image = await createImageBitmap(imgblob);
    ctx.drawImage(image, 0, 0, 100, 100);
    const mediaStream = canvas.captureStream(25);

    const videoTracks = mediaStream.getVideoTracks();

    return videoTracks;
}

async function subscribeToSession() {
    veRoom = new VideoExpress.Room({
        apiKey, sessionId, token,
        participantName: "ecrecorder",
        roomContainer: "roomContainer",
        managedLayoutOptions: {
            layoutMode: "grid"
        }
    });
    console.log("initializeSession", {veRoom});

    const videoTracks = await getVideoSource();
    veRoom.join({
        publisherProperties: {
            resolution: "1920x1080",
            videoSource: videoTracks[0],
            publishVideo: false,
            audioSource: null
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

// Change layout type of video express
async function applyLayoutType() {
    if (layoutType === 1) {
        veRoom.setLayoutMode('grid');
    } else if (layoutType === 2) {
        veRoom.setLayoutMode('active-speaker');
    }
    return;
}

// --------------------

// Hide Experience Composer publisher
var observer = new MutationObserver(function(mutationsList) {
    console.log(mutationsList);
    // Loop through the mutations
    for (var i = 0; i < mutationsList.length; i++) {
      var mutation = mutationsList[i];
  
      // Check if nodes were added to the DOM
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        // New element(s) added to the DOM
        var addedElement = mutation.addedNodes[0];
        // console.log("New element added:", addedElement);
        if(addedElement instanceof Element){
          if(addedElement.classList.contains("MP_subscriber_overlay") || addedElement.classList.contains("MP_publisher_overlay")){
            //get parent
            var parentElement = addedElement.parentNode;
            var h1Element = parentElement.querySelector('h1');
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
  
    if (data.type === "layoutUpdate") {
        roomLayoutInfo = data.layoutInfo;
        layoutType = data.layoutInfo.layoutType;
        videosLayout = data.layoutInfo.videosLayout;
        applyLayoutType();
    } else if (data.type === "layoutChange") {
        layoutType = data.layoutType;
        applyLayoutType();
    }
});