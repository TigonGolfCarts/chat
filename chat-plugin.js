(async function() {
  let apiUrl = 'https://api.tigondms.com';
  let wsUrl = 'wss://api.tigondms.com';
  let s3Url = 'https://s3.amazonaws.com/prod.docs.s3';

  const hostname = window.location.hostname;

  if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
    apiUrl = 'http://localhost:3000';
    wsUrl = 'ws://localhost:3000';
    s3Url = 'https://s3.amazonaws.com/dev.docs.s3';

  } else if (window.location.pathname.includes('test.docs.s3')) {
    apiUrl = 'https://testapi.tigondms.com';
    wsUrl = 'wss://testapi.tigondms.com';
    s3Url = 'https://s3.amazonaws.com/test.docs.s3';
  }

  // APIs
  const API_URL = apiUrl;
  const WS_URL = wsUrl;
  const WEB_CHAT_PATH = `${API_URL}/web-chats`;
  const INITIATE_KEY_PATH = `${WEB_CHAT_PATH}/initiate-key`;
  const VERIFY_TOKEN_PATH = `${WEB_CHAT_PATH}/verify-token`;
  const GET_REFRESH_TOKEN_PATH = `${WEB_CHAT_PATH}/get-refresh-token`;
  const NEW_CHAT_PATH = `${WEB_CHAT_PATH}/new-chat-connection`;
  const END_CHAT_PATH = `${WEB_CHAT_PATH}/end-chat`;
  const GET_CONVERSATION_PATH = `${WEB_CHAT_PATH}/chat-conversations/get-by-id`;
  const GET_MESSAGE_PATH = `${WEB_CHAT_PATH}/chat-messages/get-by-conversationId`;
  const FIRST_MESSAGE_PATH = `${WEB_CHAT_PATH}/first-message`;
  const UPLOAD_FILE_PATH = `${WEB_CHAT_PATH}/upload-files`;

  // FILES
  const S3_BASE_PATH = s3Url;
  const S3_USER_FILE_PATH = `${S3_BASE_PATH}/web-chats/user-documents`;
  const S3_CUSTOMER_FILE_PATH = `${S3_BASE_PATH}/web-chats/customer-documents`;
  const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "pdf", "mp4", "mov", "avi", "heic"];
  const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif"];
  const VIDEO_EXTENSIONS = ["mp4", "mov"];
  const MAX_FILES = 5;
  const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

  // COOKIES
  const SESSION_KEY_COOKIE = 'chat_session_key';
  const CUSTOMER_ID_COOKIE = 'customerId';
  const CUSTOMER_NAME_COOKIE = 'customerName';
  const CONVERSATION_ID_COOKIE = 'conversationId';
  const ACCESS_TOKEN_COOKIE = 'token';
  const COOKIE_MAX_AGE = 60 * 60;               // 1 hour, in seconds
  const COOKIE_REFRESH_INTERVAL = 60 * 1000;    // 60s, refresh the cookies at most once a minute

  // TIMERS
  const WS_MAX_RECONNECT_ATTEMPTS = 2;
  const WS_RECONNECT_DELAY = 3000;              // 3s
  const IDLE_DELAY = 5 * 60 * 1000;             // 5 mins
  const INACTIVITY_DELAY = 15 * 60 * 1000;      // 15 mins
  const LONG_WAIT_DELAY = 10 * 60 * 1000;       // 10 mins
  const TYPING_DEBOUNCE = 5000;                 // 5s
  const TYPING_INDICATOR_TIMEOUT = 60 * 1000;   // 60s, hide the agent typing bubble if their stop typing event never arrives

  // WEB SOCKET EVENT
  const WS_JOIN_ROOM = 'room:join';
  const WS_JOIN_ACKNOWLEDGE = 'room:join_ack';
  const WS_USER_JOINED = 'room:user_joined';
  const WS_RECEIVED_CLOSE_ROOM = 'room:received_close';
  const WS_SEND_MESSAGE = 'message:send';
  const WS_SEND_MESSAGE_ACKNOWLEDGE = 'message:send_ack';
  const WS_RECEIVED_MESSAGE = 'message:received';
  const WS_ERROR = 'error';
  const WS_TYPING_MESSAGE = 'message:typing';
  const WS_RECEIVED_TYPING_MESSAGE = 'message:received_typing';
  const WS_READ_MESSAGE = 'message:read';
  const WS_RECEIVED_READ_MESSAGE = 'message:received_read';
  const WS_CUSTOMER_STATUS_UPDATE = 'customer:status_update';
  const WS_RECEIVED_EMPLOYEE_ONLINE_STATUS_UPDATE = 'employee:received_online_status_update';

  // CONNECTION STATUS
  const CS_DISCONNECTED = 0;
  const CS_ONLINE = 1;
  const CS_IDLE = 2;

  // EMPLOYEE CONNECTION STATUS
  const ECS_OFFLINE = 0;
  const ECS_ONLINE = 1;

  // EMPLOYEE STATUS
  const ES_HIDE = null;
  const ES_ONLINE = 'Online';
  const ES_OFFLINE = 'Offline';
  const ES_QUEUE = 'In Queue';  // customer is "in queue" after the first message, waiting for an employee to join the chat

  const M_SENT = 'Sent';
  const M_FAILED = 'Failed';
  const M_READ = 'Seen';
  const M_SENDING = 'Sending...';

  // OTHERS
  const ORIGINAL_TITLE = document.title;
  const TIGON_LOGO_FILE = 'https://s3.amazonaws.com/dev.docs.s3/assets/tigon-logo.png';
  const NOTIFICAITON_SOUND_FILE = 'https://s3.amazonaws.com/dev.docs.s3/assets/notification_sound.wav';
  const NOTIFICATION_SOUND = new Audio(NOTIFICAITON_SOUND_FILE); // Pre-load the notification sound to prevent lagging
  NOTIFICATION_SOUND.volume = 0.2;

  const US_STATES = [
    "AK", "AL", "AR", "AZ", "CA", "CO", "CT", "DC", "DE", "FL", "GA", "HI", "IA", "ID", "IL", "IN", "KS",
    "KY", "LA", "MA", "MD", "ME", "MI", "MN", "MO", "MS", "MT", "NC", "ND", "NE", "NH", "NJ", "NM", "NV",
    "NY", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VA", "VT", "WA", "WI", "WV", "WY"
  ];

  const CHAT_INPUT_MAX_ROWS = 3;


  // ============== HTML / CSS ============== //

  // Render the widget inside a shadow root so the host page's CSS (e.g. global button / h3 / input rules)
  // can't restyle it, and Tailwind doesn't leak out and restyle the host page
  const chatPluginHost = document.createElement('div');
  chatPluginHost.id = 'chat-plugin-host';
  document.body.appendChild(chatPluginHost);
  const chatRoot = chatPluginHost.attachShadow({ mode: 'open' });

  chatRoot.innerHTML = '<link href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.16/tailwind.min.css" rel="stylesheet">';

  // Inject the CSS
  const style = document.createElement('style');
  style.innerHTML = `
  :host {
    all: initial;
  }
  #chat-plugin-container {
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
    font-size: 16px;
    line-height: 1.5;
    color: #000;
    text-align: left;
    z-index: 2147483000;
  }
  .hidden {
    display: none;
  }
  .bg-primary {
    background-color: #0c4774;
  }
  .border-primary {
    border-color: #0c4774;
  }
  #chat-input {
    padding-top: 9px;
    padding-bottom: 8px;
  }
  #chat-plugin-container {
    position: fixed;
    bottom: 20px;
    right: 20px;
    flex-direction: column;
  }
  #chat-unread-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 10px;
    background-color: #dc2626;
    color: #fff;
    font-size: 12px;
    font-weight: 600;
    line-height: 20px;
    text-align: center;
    box-shadow: 0 0 0 2px #fff;
  }
  #chat-bubble.has-unread {
    animation: chat-bubble-pulse 1.8s ease-out infinite;
  }
  @keyframes chat-bubble-pulse {
    0% { box-shadow: 0 0 0 0 rgba(12, 71, 116, 0.6); }
    70% { box-shadow: 0 0 0 14px rgba(12, 71, 116, 0); }
    100% { box-shadow: 0 0 0 0 rgba(12, 71, 116, 0); }
  }
  @media (prefers-reduced-motion: reduce) {
    #chat-bubble.has-unread {
      animation: none;
      box-shadow: 0 0 0 4px rgba(12, 71, 116, 0.35);
    }
  }
  #chat-callout::after {
    content: '';
    position: absolute;
    bottom: -8px;
    right: 24px;
    width: 14px;
    height: 9px;
    background: inherit;
    clip-path: polygon(0 0, 100% 0, 100% 100%);
  }
  #chat-employee-status {
    background-color: rgba(255, 255, 255, 0.14);
    border: 1px solid transparent;
    white-space: nowrap;
  }
  #chat-employee-status[data-status="${ES_OFFLINE}"] {
    background-color: transparent;
    border-color: rgba(255, 255, 255, 0.35);
    color: rgba(255, 255, 255, 0.88);
  }
  #chat-employee-status .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }
  #chat-employee-status[data-status="${ES_ONLINE}"] .status-dot {
    background-color: #4ade80;
  }
  #chat-employee-status[data-status="${ES_QUEUE}"] .status-dot {
    background-color: #fbbf24;
  }
  #chat-employee-status[data-status="${ES_OFFLINE}"] .status-dot {
    background-color: #94a3b8;
  }
  #chat-popup {
    height: 70vh;
    max-height: 70vh;
    transition: all 0.3s;
    overflow: hidden;
  }
  .chat-message-bubble {
    position: relative;
    border-radius: 18px;
  }
  .chat-message-bubble::after {
    content: '';
    position: absolute;
    bottom: 0;
    width: 10px;
    height: 12px;
    background: inherit;
  }
  .chat-message-bubble.tail-right {
    border-bottom-right-radius: 4px;
    margin-right: 8px;
  }
  .chat-message-bubble.tail-right::after {
    right: -8px;
    clip-path: polygon(0 0, 0 100%, 100% 100%);
  }
  .chat-message-bubble.tail-left {
    border-bottom-left-radius: 4px;
    margin-left: 8px;
  }
  .chat-message-bubble.tail-left::after {
    left: -8px;
    clip-path: polygon(100% 0, 100% 100%, 0 100%);
  }
  .typing-wave span {
    display: inline-block;
    animation: typing-wave 1.7s ease-in-out infinite;
  }
  @keyframes typing-wave {
    0%, 60%, 100% { transform: translateY(0); }
    30% { transform: translateY(-4px); }
  }
  @media (max-width: 768px) {
    #chat-popup {
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 100%;
      max-height: 100%;
      border-radius: 0;
    }
    #chat-callout {
      display: none !important;
    }
  }
  `;

  chatRoot.appendChild(style);

  // Create chat widget container
  const chatPluginContainer = document.createElement('div');
  chatPluginContainer.id = 'chat-plugin-container';
  chatRoot.appendChild(chatPluginContainer);
  
  // Inject the HTML
  chatPluginContainer.innerHTML = `
    <div id="chat-bubble" class="relative w-16 h-16 bg-primary rounded-full flex items-center justify-center cursor-pointer text-3xl">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
      <span id="chat-unread-badge" class="hidden"></span>
    </div>
    <span id="chat-callout" class="hidden absolute bottom-20 right-0 whitespace-nowrap bg-white text-sm rounded-full shadow-md px-4 py-2 cursor-pointer">Chat With Us</span>
    <div id="chat-popup" class="hidden absolute bottom-20 right-0 w-96 bg-white rounded-md shadow-md flex flex-col transition-all text-sm">
      <div id="chat-header" class="flex justify-between items-center space-x-3 p-4 bg-primary text-white rounded-t-md">
        <h3 class="flex-1 m-0 text-lg">Tigon Golf Carts Live Chat</h3>
        <span id="chat-employee-status" class="hidden inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium" role="status" aria-live="polite">
          <span class="status-dot mr-1.5"></span>
          <span id="chat-employee-status-text"></span>
        </span>
        <button id="close-popup" class="bg-transparent border-none text-white cursor-pointer">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div id="chat-start" class="flex-1 p-4 pt-20 flex flex-col items-center text-center">
        <img id="tigon-logo" src=${TIGON_LOGO_FILE} class="w-24 mb-4" />
        <br />
        <p class="mb-4 text-base">Connect to our customer support</p>
        <label class="flex items-start text-left text-xs text-gray-600 mb-4 cursor-pointer">
          <input type="checkbox" id="chat-terms-checkbox" required class="mt-0.5 mr-2 cursor-pointer">
          <span>I agree to receive messages from Tigon Golf Carts.</span>
        </label>
        <button id="chat-start-button" type="button" class="bg-primary text-white rounded-full px-6 py-2 cursor-pointer">Start</button>
      </div>
      <div id="chat-connection-lost" class="hidden flex-1 p-4 flex flex-col items-center justify-center text-center">
        <p class="text-base text-gray-700"></p>
      </div>
      <form id="chat-connect" class="hidden flex-1 p-4 flex flex-col overflow-y-auto" novalidate>
        <fieldset class="mb-4">
          <legend class="font-semibold text-gray-800 mb-2">Required information</legend>
          <div class="grid grid-cols-2 gap-2">
            <label class="flex flex-col">
              <span class="text-xs text-gray-600 mb-1">First name <span class="text-red-600">*</span></span>
              <input type="text" name="firstName" required autocomplete="given-name" class="border border-gray-300 rounded-md px-3 py-2 outline-none">
            </label>
            <label class="flex flex-col">
              <span class="text-xs text-gray-600 mb-1">Last name <span class="text-red-600">*</span></span>
              <input type="text" name="lastName" required autocomplete="family-name" class="border border-gray-300 rounded-md px-3 py-2 outline-none">
            </label>
            <label class="flex flex-col col-span-2">
              <span class="text-xs text-gray-600 mb-1">Phone number <span class="text-red-600">*</span></span>
              <input type="tel" name="phoneNumber" inputmode="numeric" required autocomplete="tel" placeholder="555-555-5555" class="border border-gray-300 rounded-md px-3 py-2 outline-none">
            </label>
          </div>
        </fieldset>

        <fieldset class="mb-4 pt-4 border-t border-gray-200">
          <legend class="font-semibold text-gray-800 mb-2">Optional information</legend>
          <div class="grid grid-cols-3 gap-2">
            <label class="flex flex-col col-span-3">
              <span class="text-xs text-gray-600 mb-1">Email</span>
              <input type="email" name="email" autocomplete="email" class="border border-gray-300 rounded-md px-3 py-2 outline-none">
            </label>
            <label class="flex flex-col col-span-3">
              <span class="text-xs text-gray-600 mb-1">Address 1</span>
              <input type="text" name="address1" autocomplete="address-line1" class="border border-gray-300 rounded-md px-3 py-2 outline-none">
            </label>
            <label class="flex flex-col">
              <span class="text-xs text-gray-600 mb-1">City</span>
              <input type="text" name="city" autocomplete="address-level2" class="border border-gray-300 rounded-md px-3 py-2 outline-none">
            </label>
            <label class="flex flex-col">
              <span class="text-xs text-gray-600 mb-1">State</span>
              <div class="relative">
                <select name="state" autocomplete="address-level1" class="w-full appearance-none border border-gray-300 rounded-md pl-3 pr-8 py-2 outline-none bg-white">
                  <option value=""></option>
                  ${US_STATES.map(code => `<option value="${code}">${code}</option>`).join('')}
                </select>
                <svg xmlns="http://www.w3.org/2000/svg" class="pointer-events-none absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </label>
            <label class="flex flex-col">
              <span class="text-xs text-gray-600 mb-1">Zip code</span>
              <input type="text" name="postalCode" autocomplete="postal-code" inputmode="numeric" minlength="5" maxlength="5" class="border border-gray-300 rounded-md px-3 py-2 outline-none">
            </label>
          </div>
        </fieldset>

        <div id="chat-connect-error" class="hidden text-red-600 text-xs mb-2 text-center"></div>
        <p class="text-xs text-center mb-3">By chatting, you agree to receive messages from us.</p>
        <button id="chat-connect-button" type="submit" class="self-center bg-primary text-white rounded-full px-6 py-2 cursor-pointer">Connect</button>
      </form>
      <div id="chat-messages" class="hidden flex-1 p-4 overflow-y-auto"></div>
      <div id="chat-input-container" class="hidden p-4 border-t border-gray-200">
        <div id="chat-file-preview" class="hidden mb-2 text-xs"></div>
        <div id="chat-file-error" class="hidden text-red-600 text-xs mb-2"></div>
        <div class="flex space-x-2 items-end">
          <textarea type="text" id="chat-input" rows="1" class="flex-1 border border-gray-300 rounded-md px-4 outline-none w-3/4 resize-none overflow-y-hidden" placeholder="Type your message..."></textarea>
          <input type="file" id="chat-file-input" class="hidden" multiple accept="${ALLOWED_EXTENSIONS.map(ext => '.' + ext).join(',')}">
          <button id="chat-file-button" type="button" class="h-10 border border-gray-300 text-gray-600 rounded-md px-2 cursor-pointer" title="Attach a file" aria-label="Attach a file">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
            </svg>
          </button>
          <button id="chat-submit" class="h-10 bg-primary text-white rounded-md px-4 cursor-pointer">Send</button>
        </div>
        
        <!-- <div class="flex text-center text-xs pt-4">
          <span class="flex-1">By chatting, you agree to receive messages from us.</span>
        </div> -->
      </div>
    </div>
  `;


  const chatInput = chatRoot.getElementById('chat-input');
  const chatSubmit = chatRoot.getElementById('chat-submit');
  const chatMessages = chatRoot.getElementById('chat-messages');
  const chatBubble = chatRoot.getElementById('chat-bubble');
  const chatPopup = chatRoot.getElementById('chat-popup');
  const closePopup = chatRoot.getElementById('close-popup');
  const chatCallout = chatRoot.getElementById('chat-callout');
  const chatUnreadBadge = chatRoot.getElementById('chat-unread-badge');
  const chatEmployeeStatus = chatRoot.getElementById('chat-employee-status');
  const chatEmployeeStatusText = chatRoot.getElementById('chat-employee-status-text');

  const chatFileInput = chatRoot.getElementById('chat-file-input');
  const chatFileButton = chatRoot.getElementById('chat-file-button');
  const chatFilePreview = chatRoot.getElementById('chat-file-preview');
  const chatFileError = chatRoot.getElementById('chat-file-error');

  const chatStart = chatRoot.getElementById('chat-start');
  const chatStartButton = chatRoot.getElementById('chat-start-button');
  const chatTermsCheckbox = chatRoot.getElementById('chat-terms-checkbox');
  const chatConnect = chatRoot.getElementById('chat-connect');
  const chatConnectButton = chatRoot.getElementById('chat-connect-button');
  const chatPhoneInput = chatConnect.querySelector('input[name="phoneNumber"]');
  const chatInputContainer = chatRoot.getElementById('chat-input-container');
  const chatConnectError = chatRoot.getElementById('chat-connect-error');
  const chatConnectionLost = chatRoot.getElementById('chat-connection-lost');

  let socket = null;
  let reconnectAttempts = 0;
  let reconnectTimer = null;

  let lastCookieRefresh = 0;  // the last time cookies get refreshed

  let selectedFiles = [];
  let selectedFilePreviewUrls = [];
  let isConnected = false;
  let isStarted = false;
  let isFirstMessage = true;
  let isConnectionLost = false;
  let sentConnectionLost = false;
  let sentConnectionClose = false
  let isTyping = false;
  let numberOfUnreadMessage = 0;
  let inactivityTimer = null;
  let lastSentConnectionStatus = null;
  let idleTimer = null;
  let longWaitTimer = null;
  let longWaitStartedAt = null;   // when the first unanswered customer message was sent, null when the agent replied last
  let typingTimer = null;
  let typingIndicatorTimer = null;
  let lastReplyTimestamp = 0;       // server timestamp of the latest agent message displayed
  let lastReadSentTimestamp = 0;    // latest agent message the server was told the customer has read
  let agentReadTimestamp = 0;       // the agent has read every customer message up to this server timestamp
  const pendingMessages = new Map(); // requestId -> message element, waiting for its server timestamp in the send ack


  // ============== GENERIC MESSAGES ============== //

  const NOTIFICATION_TITLE = "New Message from Tigon";
  const WELCOME_MESSAGE = "Thank you for contacting Tigon Golf Carts. Please type your question below and a Tigon representative will join you shortly.";
  const CONNECTION_LOST_MESSAGE = "Sorry, live chat is currently unavailable. Please contact us at 844-844-6638, and we will be glad to assist you.";
  const LONG_WAIT_MESSAGE = "Sorry for the long wait. A Tigon representative will get back to you shortly.";
  const CHAT_END_MESSAGE = "The chat has ended.";

  function getJoinMessage(employeeFirstName) {
    var joinMessage = 'A Tigon Golf Carts support has joined the chat.';
    if (employeeFirstName && employeeFirstName != '')
      joinMessage = `${employeeFirstName} from Tigon Golf Carts has joined the chat.`;
    return joinMessage;
  }

  // ============== PRE-CHECK ============== //

  await checkExistingSession();

  async function checkExistingSession() {
    try {
      // verify valid token
      const isValidToken = await verifyToken();
      if (!isValidToken) throw new Error('Invalid token');

      // fetch chatConversation
      const chatConversation = await fetchChatConversation();
      if (!chatConversation) throw new Error('Conversation not found');

      // check if the converstation status is active
      if (chatConversation.conversationStatus != 1) throw new Error('Conversation is not active');

      // load chat history
      const chatMessage = await fetchChatHistory();
      if (!chatMessage) throw new Error('Chat history not found');

      isConnected = true;
      isStarted = true;
      isFirstMessage = false;

      populateMessages(chatMessage);

      // employeeConnectionStatus is unset until an employee joins, so the customer is still in the queue
      const employeeStatus = chatConversation.employeeConnectionStatus == null ? ES_QUEUE
        : chatConversation.employeeConnectionStatus == ECS_ONLINE ? ES_ONLINE : ES_OFFLINE;
      setChatEmployeeStatus(employeeStatus);

      connectWebSocket();
    } catch (e) {
      // No session to restore, or restoring failed partway, start from a blank chat
      resetState();
    }
  }

  async function verifyToken(retried = false) {
    try {
      const token = getCookie(ACCESS_TOKEN_COOKIE);
      if (!token || token == '') {
        return false;
      }

      const response = await fetch(VERIFY_TOKEN_PATH, {
        method: 'POST',
        headers: { 'x-auth-token': token },
      });

      if (response.status == 401 && !retried && await getRefreshToken()) {
        return await verifyToken(true);
      }

      if (!response.ok) return false;

      const result = await response.json();

      // reset cookies
      setCookie(CUSTOMER_ID_COOKIE, result.customerId, COOKIE_MAX_AGE);
      setCookie(CONVERSATION_ID_COOKIE, result.conversationId, COOKIE_MAX_AGE);

      return true;
    } catch (e) {
      return false;
    }
  }

  async function fetchChatConversation(retried = false) {
    try {
      const token = getCookie(ACCESS_TOKEN_COOKIE);
      const conversationId = getCookie(CONVERSATION_ID_COOKIE);
      if (!token || token == '' || !conversationId || conversationId == '') return null;

      const response = await fetch(GET_CONVERSATION_PATH, {
        method: 'POST',
        headers: { 
          'x-auth-token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          conversationId: conversationId,
        }),
      });

      if (response.status == 401 && !retried && await getRefreshToken()) {
        return await fetchChatConversation(true);
      }

      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

      return await response.json();
    } catch (e) {
      return null;
    }
  }

  async function fetchChatHistory(retried = false) {
    try {
      const token = getCookie(ACCESS_TOKEN_COOKIE);
      const conversationId = getCookie(CONVERSATION_ID_COOKIE);
      if (!token || token == '' || !conversationId || conversationId == '') return null;

      const response = await fetch(GET_MESSAGE_PATH, {
        method: 'POST',
        headers: { 
          'x-auth-token': token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          conversationId: conversationId,
        }),
      });

      if (response.status == 401 && !retried && await getRefreshToken()) {
        return await fetchChatHistory(true);
      }

      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

      return await response.json();
    } catch (e) {
      return null;
    }
  }

  function populateMessages(chatMessage) {
    displayReplyMessage(WELCOME_MESSAGE);

    const customerId = getCookie(CUSTOMER_ID_COOKIE);
    if (!customerId || customerId == '') throw new Error('Invalid customerId');

    let lastUserMessageElement = null;

    // Timestamp of the first customer message since the last agent reply, null when the agent replied last
    let firstUnansweredTimestamp = null;
    
    for (var message of chatMessage.messages) {
      if (message.isSystemMessage) {
        if (message.createdBy != customerId)
          showSystemMessage(getJoinMessage(message.employeeName?.firstName ?? ''));
      } else {
        if (message.isOutbound) {
          displayReplyMessage(message.text, toS3MessageFiles(message.fileNames, true), message.employeeName);
          lastReplyTimestamp = Math.max(lastReplyTimestamp, message.timestamp || 0);
          firstUnansweredTimestamp = null;

          if (!message.isRead) {
            numberOfUnreadMessage += 1;
          }
        } else {
          const messageElement = displayUserMessage(message.text, toS3MessageFiles(message.fileNames, false));
          if (messageElement) {
            messageElement.dataset.timestamp = message.timestamp;
            lastUserMessageElement = messageElement;
          }
          if (message.isRead) agentReadTimestamp = Math.max(agentReadTimestamp, message.timestamp || 0);
          if (firstUnansweredTimestamp == null) firstUnansweredTimestamp = message.timestamp;
        }
      }
    }

    // Messages in the history were all delivered, show which ones the agent read
    showStatus(lastUserMessageElement, M_SENT);
    resetPageTitle();

    // Resume the longWait countdown where it was before the reload, the message shows right away if the wait is already over
    if (firstUnansweredTimestamp != null) startLongWaitTimer(firstUnansweredTimestamp);
  }

  // ============== TOGGLE POPUP ============== //

  chatBubble.addEventListener('click', function() {
    togglePopup();
  });

  closePopup.addEventListener('click', function() {
    togglePopup();
  });

  chatCallout.addEventListener('click', function() {
    togglePopup();
  });

  function togglePopup() {
    const chatPopup = chatRoot.getElementById('chat-popup');
    chatPopup.classList.toggle('hidden');
    updateChatCallout();
    if (!chatPopup.classList.contains('hidden')) {
      updateChatView();
      markRepliesRead();
    }
    updateUnreadBadge();
    updateConnectionStatus();
  }

  // The customer came back to the tab with the popup open, the replies received meanwhile are now read
  document.addEventListener('visibilitychange', function() {
    markRepliesRead();
    updateConnectionStatus();
  });


  // ============== START ============== //

  chatStartButton.addEventListener('click', async function() {
    // The user must agree to the terms before starting
    if (!chatTermsCheckbox.reportValidity()) return;

    await getInitialKey();

    isStarted = true;
    updateChatView();
    chatConnect.querySelector('input').focus();
  });

  async function getInitialKey(retried = false) {
    try {
      const response = await fetch(INITIATE_KEY_PATH, {
        method: 'POST',
      });

      if (!response.ok) {
        if (retried) throw new Error(`Request failed with status ${response.status}`);
        else return await getInitialKey(true);
      }

      const result = await response.json();
      setCookie(SESSION_KEY_COOKIE, result.signKey, COOKIE_MAX_AGE);
    } catch (e) {
      onConnectionLost();
    }
  }


  // ============== CONNECT ============== //

  chatConnect.addEventListener('submit', async function(event) {
    event.preventDefault();
    chatConnectError.classList.add('hidden');

    const phone = sanitizePhone(chatPhoneInput.value);
    chatPhoneInput.setCustomValidity(
      phone && !isValidUSPhone(phone) ? 'Please enter a valid 10-digit US phone number.' : ''
    );

    if (!chatConnect.reportValidity()) return;

    chatConnectButton.disabled = true;
    chatConnectButton.textContent = 'Connecting...';

    // Trim values and drop empty optional fields
    const customer = {};
    new FormData(chatConnect).forEach((value, key) => {
      const trimmed = value.trim();
      if (trimmed) customer[key] = trimmed;
    });
    customer.phoneNumber = phone;

    try {
      const sessionKey = getCookie(SESSION_KEY_COOKIE);
      if (!sessionKey || sessionKey == '') throw new Error('Invalid key');

      const response = await fetch(NEW_CHAT_PATH, {
        method: 'POST',
        headers: {
          'x-auth-token': sessionKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(customer)
      });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

      const result = await response.json();

      setCookie(CUSTOMER_ID_COOKIE, result.customerId, COOKIE_MAX_AGE);
      setCookie(CUSTOMER_NAME_COOKIE, customer.firstName, COOKIE_MAX_AGE);

      connectWebSocket();
    } catch (e) {
      onConnectionLost();
    }
  });


  // ============== WEB SOCKET ============== //

  function connectWebSocket() {
    const customerId = getCookie(CUSTOMER_ID_COOKIE);
    const customerName = getCookie(CUSTOMER_NAME_COOKIE);

    if (!customerId || customerId == '' || !customerName || customerName == '')
      throw new Error('Invalid cookies');

    const wsPath = `${WS_URL}?userId=${customerId}&userName=${customerName}&isCustomer=true`;
    const ws = new WebSocket(wsPath);
    socket = ws;
    
    const isReconnect = reconnectAttempts > 0;

    ws.addEventListener('open', function() {
      if (ws !== socket) return;

      reconnectAttempts = 0;
      onConnected();

      if (getCookie(CONVERSATION_ID_COOKIE)) {
        // Reconnect to an existing conversation (page reload or server drop), rejoin the room to receive messages again
        joinRoom();
        updateConnectionStatus();

      } else if (!isReconnect) {
        // Fresh connection, the welcome message of a restored chat is shown by populateMessages
        displayReplyMessage(WELCOME_MESSAGE);
      }
    });

    ws.addEventListener('message', function(event) {
      if (ws !== socket) return;

      let response;
      try {
        response = JSON.parse(event.data);
      } catch (e) {
        return;
      }

      const { event: evt, data, requestId } = response;

      if (evt === WS_RECEIVED_MESSAGE) {
        const customerId = getCookie(CUSTOMER_ID_COOKIE);
        const sender = data.sender;
        const message = data.content;

        if (!customerId || customerId == '') {
          onConnectionLost();
          return;
        }

        if (sender.userId != customerId && !message.isSystemMessage) {
          resetInactivityTimer();
          clearLongWaitTimer();
          displayReplyMessage(message.text, toS3MessageFiles(message.fileNames, true), message.employeeName);
          lastReplyTimestamp = Math.max(lastReplyTimestamp, message.timestamp || 0);
          
          playNotificationSound();
          numberOfUnreadMessage += 1;
          resetPageTitle();

          markRepliesRead();
        }

      } else if (evt === WS_SEND_MESSAGE_ACKNOWLEDGE) {
        // The server saved the message, keep its timestamp to match it with the agent read receipts
        const { messageElement } = pendingMessages.get(requestId);
        pendingMessages.delete(requestId);

        if (messageElement && data?.success && data.timestamp) {
          messageElement.dataset.timestamp = data.timestamp;
          showStatus(messageElement, M_SENT);
          startLongWaitTimer();
        }

      } else if (evt === WS_JOIN_ACKNOWLEDGE) {
        // Back in the room, report the replies already read (restored history with the popup open)
        if (data?.success) markRepliesRead();

      } else if (evt === WS_RECEIVED_READ_MESSAGE) {
        const customerId = getCookie(CUSTOMER_ID_COOKIE);

        if (!customerId || customerId == '') {
          onConnectionLost();
          return;
        }

        if (data.user?.userId != customerId) {
          agentReadTimestamp = Math.max(agentReadTimestamp, Number(data.lastReadTimestamp) || 0);
          refreshSentStatuses();
        }

      } else if (evt === WS_USER_JOINED) {
        resetInactivityTimer();
        showSystemMessage(getJoinMessage(data.user.userName ?? ''));
        setChatEmployeeStatus(ES_ONLINE);

      } else if (evt === WS_RECEIVED_TYPING_MESSAGE) {
        const customerId = getCookie(CUSTOMER_ID_COOKIE);

        if (!customerId || customerId == '') {
          onConnectionLost();
          return;
        }

        const { user, isTyping } = data;

        if (user?.userId != customerId) {
          // The agent typing is activity, so the customer is not asked if they still need help
          resetInactivityTimer();
          showTyping(isTyping, user?.userName ?? '');
          if (isTyping) pauseLongWaitTimer();
          else resumeLongWaitTimer();
        }

      } else if (evt === WS_RECEIVED_EMPLOYEE_ONLINE_STATUS_UPDATE) {
        const customerId = getCookie(CUSTOMER_ID_COOKIE);

        if (!customerId || customerId == '') {
          onConnectionLost();
          return;
        }

        const { user, status } = data;
        
        if (user?.userId != customerId) {
          setChatEmployeeStatus(status == ECS_ONLINE ? ES_ONLINE : ES_OFFLINE);
        }

      } else if (evt === WS_ERROR) {
        const { messageElement, message, files } = pendingMessages.get(requestId);
        if (messageElement) {
          showStatus(messageElement, M_FAILED, message, files);
        }

        if (data.text.includes("Conversation is closed")) {
          onConnectionClose();

          // hide the resend button
          if (messageElement) {
            showStatus(messageElement, M_FAILED, message, files);
          }
        }

      } else if (evt === WS_RECEIVED_CLOSE_ROOM) {
        onConnectionClose();
      }
    });

    ws.addEventListener('close', function(event) {
      // The customer ended the chat (closeWebSocket cleared the socket), endChat resets the state
      if (ws !== socket) return;

      // Server issue, try to reconnect before giving up
      if (reconnectAttempts < WS_MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        reconnectTimer = setTimeout(connectWebSocket, WS_RECONNECT_DELAY);
        return;
      }

      socket = null;
      onConnectionLost();
    });

    ws.addEventListener('error', function(error) {
      onConnectionLost();
    });
  }

  function isWebSocketOpen() {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error(`Web socket is not open.`);
    }
    return true;
  }

  function joinRoom(isFirstJoin = false) {
    if (!isWebSocketOpen()) return;

    const payload = {
      conversationId: getCookie(CONVERSATION_ID_COOKIE),
      userId: getCookie(CUSTOMER_ID_COOKIE),
      userName: getCookie(CUSTOMER_NAME_COOKIE),
      isOutbound: false,
      isFirstJoin,
    };

    socket.send(JSON.stringify({ event: WS_JOIN_ROOM, payload }));
  }

  function sendWebSocketMessage(text, fileNames) {
    if (!isWebSocketOpen()) return;

    const payload = {
      conversationId: getCookie(CONVERSATION_ID_COOKIE),
      text,
      fileNames,
      isOutbound: false,
      createdBy: getCookie(CUSTOMER_ID_COOKIE),
    };

    // The send ack returns this id, so the message can be matched with its server timestamp
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    socket.send(JSON.stringify({ event: WS_SEND_MESSAGE, payload, requestId }));
    return requestId;
  }

  function sendTypingEvent(isTyping) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const conversationId = getCookie(CONVERSATION_ID_COOKIE);
    if (!conversationId) return;

    const payload = {
      conversationId,
      userId: getCookie(CUSTOMER_ID_COOKIE),
      userName: getCookie(CUSTOMER_NAME_COOKIE),
      isTyping
    };

    socket.send(JSON.stringify({ event: WS_TYPING_MESSAGE, payload }));
  }

  function sendConnectionStatusEvent(connectionStatus) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const conversationId = getCookie(CONVERSATION_ID_COOKIE);
    if (!conversationId) return;

    const payload = {
      conversationId,
      userId: getCookie(CUSTOMER_ID_COOKIE),
      userName: getCookie(CUSTOMER_NAME_COOKIE),
      status: connectionStatus,
    };

    socket.send(JSON.stringify({ event: WS_CUSTOMER_STATUS_UPDATE, payload }));
    lastSentConnectionStatus = connectionStatus;
  }


  // ============== READ RECEIPT ============== //

  // The customer can only read the messages while the popup is open in the visible tab
  function isChatVisible() {
    return isConnected && !chatPopup.classList.contains('hidden') && document.visibilityState === 'visible';
  }

  // Clear the unread count and tell the agent the replies were read, only once per new reply
  function markRepliesRead() {
    if (!isChatVisible()) return;

    numberOfUnreadMessage = 0;
    resetPageTitle();

    const conversationId = getCookie(CONVERSATION_ID_COOKIE);
    if (!conversationId || lastReplyTimestamp <= lastReadSentTimestamp) return;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const payload = {
      conversationId,
      lastReadTimestamp: lastReplyTimestamp,
      isOutbound: false,
    };

    socket.send(JSON.stringify({ event: WS_READ_MESSAGE, payload }));
    lastReadSentTimestamp = lastReplyTimestamp;
  }

  // Redraw the "Seen" and "Sent" statuses on every sent user message: "Seen" once the agent read it, "Sent" until then.
  // Compared by server timestamp, so a read receipt for older messages never marks a newer one as seen.
  // Messages still sending or failed keep their own status
  function refreshSentStatuses() {
    clearSentStatuses();

    chatMessages.querySelectorAll('.chat-user-message').forEach(messageElement => {
      if (hasPendingStatus(messageElement)) return;
      const timestamp = Number(messageElement.dataset.timestamp);
      const isSeen = !!timestamp && timestamp <= agentReadTimestamp;
      appendSentStatus(messageElement, isSeen ? M_READ : M_SENT);
    });
  }


  // ============== CONNECTION STATUS ============== //

  function updateConnectionStatus() {
    if (isChatVisible()) {
      resetIdleTimer();
      if (lastSentConnectionStatus != CS_ONLINE)
        sendConnectionStatusEvent(CS_ONLINE);
    
    } else if (isConnected) {
      if (idleTimer == null && lastSentConnectionStatus != CS_IDLE)
        idleTimer = setTimeout(() => sendConnectionStatusEvent(CS_IDLE), IDLE_DELAY);
    
    } else if (lastSentConnectionStatus != null) {
      resetIdleTimer();
      if (lastSentConnectionStatus != CS_DISCONNECTED)
        sendConnectionStatusEvent(CS_DISCONNECTED);
    
    }
  }

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = null;
  }


  // ============== END CHAT ============== //

  async function endChat() {
    // close web socket
    closeWebSocket();

    // end conversation -- set conversationStatus to CLOSED
    await endConversation();

    // reset state
    resetState();
  }

  function closeWebSocket() {
    // Clear the socket first so its close event does not try to reconnect
    const ws = socket;
    socket = null;

    clearTimeout(reconnectTimer);
    reconnectAttempts = 0;
    if (ws) ws.close(1000, "Customer ended the chat.");
  }

  async function endConversation(retried = false) {
    try {
      const token = getCookie(ACCESS_TOKEN_COOKIE);
      if (!token || token == '') throw new Error('Invalid token');

      const response = await fetch(END_CHAT_PATH, {
        method: 'POST',
        headers: { 'x-auth-token': token },
      });

      if (response.status == 401 && !retried && await getRefreshToken()) {
        return await endConversation(true);
      }

      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

    } catch (e) {
      onConnectionLost();
    }
  }

  // Reconnecting failed, keep the chat visible with the issue message so the customer can call instead
  function onConnectionLost() {
    if (sentConnectionLost || sentConnectionClose) return;

    // Never connected, the customer is still on the connect form
    if (!isConnected) {
      chatConnectionLost.querySelector('p').textContent = CONNECTION_LOST_MESSAGE;
      resetState(true);
      return;
    }

    displayReplyMessage(CONNECTION_LOST_MESSAGE);
    sentConnectionLost = true;

    setChatEmployeeStatus(ES_OFFLINE);

    // The conversation can not continue, keep its messages visible but disable the input
    clearConversation();
    setChatInputDisabled(true);
    showNewChatButton();
  }

  function onConnectionClose() {
    if (sentConnectionLost || sentConnectionClose) return;

    showSystemMessage(CHAT_END_MESSAGE);
    setChatEmployeeStatus(ES_OFFLINE);
    sentConnectionClose = true;

    // The conversation can not continue, keep its messages visible but disable the input
    clearConversation();
    setChatInputDisabled(true);
    showNewChatButton();
  }

  function showNewChatButton() {
    const newChatElement = document.createElement('div');
    newChatElement.className = 'flex flex-col items-center mb-3 text-xs text-gray-500';
    newChatElement.innerHTML = `
      <button type="button" class="border border-gray-300 text-gray-700 rounded-md px-3 py-1 cursor-pointer">Start a new chat</button>
    `;
    newChatElement.querySelector('button').addEventListener('click', () => resetState());
    chatMessages.appendChild(newChatElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function setChatInputDisabled(disabled) {
    clearChatInput();
    chatInputContainer.querySelectorAll('input, textarea, button').forEach(element => element.disabled = disabled);
  }

  function clearChatInput() {
    chatInput.value = '';
    resizeChatInput();
  }

  // Stop the conversation timers and clear its cookies, so a reload does not restore it
  function clearConversation() {
    reconnectAttempts = 0;
    clearTimeout(reconnectTimer);

    isTyping = false;
    clearTimeout(typingTimer);
    clearTimeout(typingIndicatorTimer);

    resetIdleTimer();
    clearTimeout(inactivityTimer);
    clearLongWaitTimer();

    clearChatCookies();
  }

  // Back to a blank chat, showing the connection lost screen instead of the start screen when connectionLost
  function resetState(connectionLost = false) {
    // state variables
    clearSelectedFiles();
    isConnected = false;
    isStarted = false;
    isFirstMessage = true;
    isConnectionLost = connectionLost;
    sentConnectionLost = false;
    sentConnectionClose = false;
    lastSentConnectionStatus = null;
    numberOfUnreadMessage = 0;
    lastReplyTimestamp = 0;
    lastReadSentTimestamp = 0;
    agentReadTimestamp = 0;
    pendingMessages.clear();
    clearConversation();

    // html
    chatInput.value = '';
    setChatInputDisabled(false);
    chatMessages.innerHTML = '';
    chatTermsCheckbox.checked = false;
    chatConnect.reset();
    chatConnectButton.disabled = false;
    chatConnectButton.textContent = 'Connect';
    setChatEmployeeStatus(ES_HIDE);
    resetPageTitle();
    updateChatView();
  }


  // ============== SEND MESSAGE ============== //

  chatInput.addEventListener('input', function() {
    resizeChatInput();
    resetInactivityTimer();

    // Send typing:start only once per typing session.
    if (!isTyping) {
      isTyping = true;
      sendTypingEvent(isTyping);
    }

    // Reset the debounce timer on every keystroke.
    clearTimeout(typingTimer);

    typingTimer = setTimeout(() => {
      isTyping = false;
      sendTypingEvent(isTyping);
    }, TYPING_DEBOUNCE);
  });

  chatInput.addEventListener('keyup', function(event) {
    if (event.key === 'Enter') {
      chatSubmit.click();
    }
  });

  chatSubmit.addEventListener('click', async function() {
    const message = chatInput.value.trim();
    const files = selectedFiles;
    if (!message && files.length === 0) return;

    chatMessages.scrollTop = chatMessages.scrollHeight;

    clearChatInput();
    clearSelectedFiles();
    await onUserRequest(message, files);

    if (isTyping) {
      isTyping = false;
      sendTypingEvent(isTyping);
    }
  });

  async function onUserRequest(message, files) {
    // Handle user request here
    resetInactivityTimer();

    // read all messages and reset notification
    numberOfUnreadMessage = 0;
    resetPageTitle();

    // Show the local files right away, they are switched to their S3 links once sent
    const messageFiles = files.map(file => ({ name: file.name, url: URL.createObjectURL(file) }));
    const messageElement = displayUserMessage(message, messageFiles);
    await deliverUserMessage(messageElement, message, files);
  }

  // Send the message, showing its status (sending, then sent or failed with a resend button) below the message
  async function deliverUserMessage(messageElement, message, files) {
    const wasFirstMessage = isFirstMessage;
    // Set before sending so a message typed while this one is pending goes to the next endpoint
    isFirstMessage = false;

    showStatus(messageElement, M_SENDING);
    try {
      let fileNames;
      if (wasFirstMessage) {
        const result = await handleFirstMessage(message, files);
        fileNames = result.fileNames;
        updateMessageFileUrls(messageElement, fileNames);

        if (messageElement && result.timestamp) messageElement.dataset.timestamp = result.timestamp;
        
        joinRoom(true);
        updateConnectionStatus();
        setChatEmployeeStatus(ES_QUEUE);
        showStatus(messageElement, M_SENT);
      } else {
        if (files && files.length > 0) {
          fileNames = await uploadFiles(files);
          updateMessageFileUrls(messageElement, fileNames);
        }
        
        const requestId = sendWebSocketMessage(message, fileNames);
        if (messageElement && requestId) pendingMessages.set(requestId, { messageElement, message, files });
      }
    } catch (e) {
      // The conversation was not created, so the resend must go to the first message endpoint again
      if (wasFirstMessage) isFirstMessage = true;
      showStatus(messageElement, M_FAILED, message, files);
    }
  }

  async function handleFirstMessage(message, files) {
    const sessionKey = getCookie(SESSION_KEY_COOKIE);
    const customerId = getCookie(CUSTOMER_ID_COOKIE);

    if (!sessionKey || sessionKey == '' || !customerId || customerId == '') {
      onConnectionLost();
      throw new Error('Invalid cookies');
    }

    const formData = new FormData();
    formData.append('customerId', customerId);
    formData.append('text', message);
    for (const file of files || []) {
      formData.append('files', file);
    }

    // Do not set Content-Type, the browser adds the multipart boundary
    const response = await fetch(FIRST_MESSAGE_PATH, {
      method: 'POST',
      headers: { 'x-auth-token': sessionKey },
      body: formData
    });
    if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

    const result = await response.json();

    setCookie(CONVERSATION_ID_COOKIE, result.conversationId, COOKIE_MAX_AGE);
    setCookie(ACCESS_TOKEN_COOKIE, result.token, COOKIE_MAX_AGE);

    // S3 file names of the uploaded files, in the same order as the files sent,
    // and the server timestamp of the message to match it with the agent read receipts
    return { fileNames: result.fileNames, timestamp: result.timestamp };
  }

  // Returns the S3 file names of the uploaded files, in the same order as the files sent
  async function uploadFiles(files, retried = false) {
    const token = getCookie(ACCESS_TOKEN_COOKIE);

    if (!token || token == '') {
      onConnectionLost();
      throw new Error('Invalid cookies');
    }

    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }

    // Do not set Content-Type, the browser adds the multipart boundary
    const response = await fetch(UPLOAD_FILE_PATH, {
      method: 'POST',
      headers: { 'x-auth-token': token },
      body: formData
    });

    if (response.status == 401 && !retried && await getRefreshToken()) {
      return await uploadFiles(files, true);
    }

    if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

    const result = await response.json();
    return result.fileNames;
  }


  // ============== AUTO MESSAGES ============== //

  // Start the longWait countdown on the first customer message since the last agent reply,
  // later customer messages keep the running countdown so the wait counts from the first unanswered one.
  // startedAt is when that first unanswered message was sent, earlier than now when restoring the chat after a reload
  function startLongWaitTimer(startedAt = Date.now()) {
    if (longWaitStartedAt == null) longWaitStartedAt = startedAt;
    // Paused while the agent is typing, it restarts when they stop
    if (longWaitTimer || chatRoot.getElementById('chat-typing')) return;
    scheduleLongWaitMessage(longWaitStartedAt);
  }

  // Agent started typing, they are answering so hold the countdown but keep the customer waiting
  function pauseLongWaitTimer() {
    clearTimeout(longWaitTimer);
    longWaitTimer = null;
  }

  // Agent stopped typing without replying, give them a full delay from now before the long wait message
  function resumeLongWaitTimer() {
    if (longWaitStartedAt == null || longWaitTimer) return;
    scheduleLongWaitMessage(Date.now());
  }

  // Stop the longWait countdown, called when the agent replies
  function clearLongWaitTimer() {
    pauseLongWaitTimer();
    longWaitStartedAt = null;
  }

  function scheduleLongWaitMessage(countFrom) {
    if (!isConnected || !isStarted || isFirstMessage) return;
    const remainingDelay = Math.max(0, countFrom + LONG_WAIT_DELAY - Date.now());
    longWaitTimer = setTimeout(() => {
      // Shown once per wait, the next customer message starts a new one
      clearLongWaitTimer();
      displayReplyMessage(LONG_WAIT_MESSAGE);
    }, remainingDelay);
  }


  // ============== DISPLAY MESSAGES ============== //

  // Display a message sent by the user, with its files ({ name, url }) in the same bubble
  function displayUserMessage(message, files) {
    const messageElement = displayMessage({
      message,
      files,
      senderName: 'You',
      alignClass: 'items-end',
      bubbleClass: 'bg-primary text-white tail-right',
    });
    if (!messageElement) return null;

    // Gets its "Sent" or "Seen" status once it is sent, by showStatus
    messageElement.classList.add('chat-user-message');
    return messageElement;
  }

  // Display a message received from the agent, with its files ({ name, url }) in the same bubble
  function displayReplyMessage(message, files, employeeName) {
    showTyping(false);

    var senderName = 'Tigon Golf Carts';
    if (employeeName?.firstName && employeeName?.firstName != '')
      senderName = employeeName.firstName + ' - ' + senderName;
    
    displayMessage({
      message,
      files,
      senderName,
      alignClass: 'items-start',
      bubbleClass: 'bg-gray-200 text-black tail-left',
    });
  }

  // The sender name is at the top of the bubble, the status (see showStatus) is added at its bottom
  function displayMessage({ message, files, senderName, alignClass, bubbleClass }) {
    files = files || [];
    if (!message && files.length === 0) return null;

    const messageElement = document.createElement('div');
    messageElement.className = `flex flex-col ${alignClass} mb-3`;
    messageElement.innerHTML = `
      <div class="chat-message-bubble ${bubbleClass} py-2 px-4 max-w-[70%]">
        <div class="text-xs font-semibold opacity-75 mb-1"></div>
      </div>
    `;

    // Set with textContent so the sender and the message are never parsed as HTML
    const bubbleElement = messageElement.firstElementChild;
    bubbleElement.firstElementChild.textContent = senderName;
    if (message) {
      const textElement = document.createElement('div');
      textElement.className = 'break-words';
      textElement.textContent = message;
      bubbleElement.appendChild(textElement);
    }
    for (const file of files) {
      bubbleElement.appendChild(createMessageFileElement(file));
    }

    chatMessages.appendChild(messageElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return messageElement;
  }

  // A file in a message bubble, shown as a fixed 80x80 thumbnail: the image, the first video frame,
  // or the extension for other files. Clicking it opens the file in a new tab
  function createMessageFileElement(file) {
    const linkElement = document.createElement('a');
    linkElement.className = 'chat-message-file inline-block align-top mt-1 mr-1';
    linkElement.href = file.url;
    linkElement.target = '_blank';
    linkElement.rel = 'noopener noreferrer';
    linkElement.title = file.name;

    const fileKind = getFileKind(file.name);
    if (fileKind === 'image') {
      const imageElement = document.createElement('img');
      imageElement.className = 'w-20 h-20 object-cover rounded';
      imageElement.src = file.url;
      imageElement.alt = file.name;
      linkElement.appendChild(imageElement);
    } else if (fileKind === 'video') {
      const videoElement = document.createElement('video');
      videoElement.className = 'w-20 h-20 object-cover rounded';
      videoElement.src = file.url;
      videoElement.muted = true;
      videoElement.playsInline = true;
      videoElement.preload = 'metadata';
      linkElement.appendChild(videoElement);
    } else {
      linkElement.appendChild(createExtensionThumbnail(file.name, 'w-20 h-20 text-sm'));
    }
    return linkElement;
  }

  // Point the files of a sent message to their S3 copies and free the local previews,
  // fileNames are in the same order as the files displayed
  function updateMessageFileUrls(messageElement, fileNames) {
    if (!messageElement || !fileNames) return;

    messageElement.querySelectorAll('.chat-message-file').forEach((linkElement, index) => {
      if (!fileNames[index]) return;

      const localUrl = linkElement.href;
      const s3Url = getS3FileUrl(fileNames[index], false);
      linkElement.href = s3Url;
      const mediaElement = linkElement.querySelector('img, video');
      if (mediaElement) mediaElement.src = s3Url;
      if (localUrl.startsWith('blob:')) URL.revokeObjectURL(localUrl);
    });
  }

  // Show a small status at the bottom of the message bubble, replacing any previous status:
  // 'sending' shows "Sending...", 'sent' lets refreshSentStatuses decide between "Seen" or "Sent",
  // 'failed' shows "Failed" with a red button below the bubble to resend the message (message and files are only needed for this one)
  function showStatus(messageElement, status, message, files) {
    if (!messageElement) return;

    const previousStatus = messageElement.querySelector('.chat-message-status');
    if (previousStatus) previousStatus.remove();
    const previousResend = messageElement.querySelector('.chat-message-resend');
    if (previousResend) previousResend.remove();

    if (status === M_SENT) {
      refreshSentStatuses();
      return;
    }

    // Styled like "Sent" and "Seen" so it stays readable on the bubble color
    const statusElement = document.createElement('div');
    statusElement.className = 'chat-message-status text-xs text-right opacity-75 mt-1';
    statusElement.textContent = status === M_SENDING ? M_SENDING : M_FAILED;
    messageElement.querySelector('.chat-message-bubble').appendChild(statusElement);

    // The resend button is outside the bubble, on the white background where red is readable
    if (status === M_FAILED && getCookie(CONVERSATION_ID_COOKIE)) {
      const resendElement = document.createElement('button');
      resendElement.type = 'button';
      resendElement.className = 'chat-message-resend text-xs text-red-600 underline cursor-pointer mt-1 mr-3';
      resendElement.textContent = 'Resend';
      resendElement.addEventListener('click', function() {
        resetInactivityTimer();
        deliverUserMessage(messageElement, message, files);
      });
      messageElement.appendChild(resendElement);
    }

    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // "Seen" and "Sent" share a class so refreshSentStatuses can clear and redraw them together
  function appendSentStatus(messageElement, text) {
    const statusElement = document.createElement('div');
    statusElement.className = 'chat-message-status chat-message-sent text-xs text-right opacity-75 mt-1';
    statusElement.textContent = text;
    messageElement.querySelector('.chat-message-bubble').appendChild(statusElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // The message is still sending or failed to send, so it can not show "Sent" or "Seen"
  function hasPendingStatus(messageElement) {
    const status = messageElement.querySelector('.chat-message-status');
    return !!status && !status.classList.contains('chat-message-sent');
  }

  // Failed statuses are not cleared so the message can still be resent
  function clearSentStatuses() {
    chatMessages.querySelectorAll('.chat-message-sent').forEach(status => status.remove());
  }

  // ============== FILE ============== //

  chatFileButton.addEventListener('click', function() {
    chatFileInput.click();
  });

  chatFileInput.addEventListener('change', function() {
    const files = Array.from(chatFileInput.files);
    // Reset the input so the same file can be picked again after removing it
    chatFileInput.value = '';
    if (files.length === 0) return;

    // Reject the whole selection if any file is invalid, keeping the files already selected
    const error = validateFiles(files);
    if (error) {
      chatFileError.textContent = error;
      chatFileError.classList.remove('hidden');
      return;
    }

    selectedFiles = selectedFiles.concat(files);
    chatFileError.classList.add('hidden');
    renderFilePreview();
    chatInput.focus();
  });

  function renderFilePreview() {
    revokeSelectedFilePreviewUrls();
    chatFilePreview.innerHTML = '';
    chatFilePreview.classList.toggle('hidden', selectedFiles.length === 0);

    selectedFiles.forEach((file, index) => {
      const fileRow = document.createElement('div');
      fileRow.className = 'flex items-center justify-between bg-gray-100 rounded-md px-3 py-2 mb-1';

      const fileInfo = document.createElement('div');
      fileInfo.className = 'flex items-center min-w-0';

      const fileName = document.createElement('span');
      fileName.className = 'truncate';
      fileName.textContent = `${file.name} (${formatFileSize(file.size)})`;

      fileInfo.appendChild(createFileThumbnail(file));
      fileInfo.appendChild(fileName);

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'ml-2 text-gray-500 cursor-pointer';
      removeButton.setAttribute('aria-label', `Remove ${file.name}`);
      removeButton.innerHTML = '&times;';
      removeButton.addEventListener('click', function() {
        selectedFiles.splice(index, 1);
        chatFileError.classList.add('hidden');
        renderFilePreview();
      });

      fileRow.appendChild(fileInfo);
      fileRow.appendChild(removeButton);
      chatFilePreview.appendChild(fileRow);
    });
  }

  // Small thumbnail of a selected file: the image or the first video frame, or the extension for other files
  function createFileThumbnail(file) {
    const fileKind = getFileKind(file.name);
    let thumbnailElement;
    if (fileKind === 'image' || fileKind === 'video') {
      const previewUrl = URL.createObjectURL(file);
      selectedFilePreviewUrls.push(previewUrl);

      thumbnailElement = document.createElement(fileKind === 'image' ? 'img' : 'video');
      thumbnailElement.src = previewUrl;
      if (fileKind === 'image') {
        thumbnailElement.alt = file.name;
      } else {
        thumbnailElement.muted = true;
        thumbnailElement.playsInline = true;
        thumbnailElement.preload = 'metadata';
      }
      thumbnailElement.className = 'w-10 h-10 object-cover rounded flex-shrink-0 mr-2';
    } else {
      thumbnailElement = createExtensionThumbnail(file.name, 'w-10 h-10 mr-2');
    }
    return thumbnailElement;
  }

  // Fixed size box showing the file extension, for files the browser cannot show inline
  function createExtensionThumbnail(fileName, sizeClass) {
    const thumbnailElement = document.createElement('div');
    thumbnailElement.className = `${sizeClass} flex items-center justify-center bg-gray-300 text-gray-700 rounded flex-shrink-0 uppercase font-semibold`;
    thumbnailElement.textContent = getFileExtension(fileName);
    return thumbnailElement;
  }

  function revokeSelectedFilePreviewUrls() {
    selectedFilePreviewUrls.forEach(url => URL.revokeObjectURL(url));
    selectedFilePreviewUrls = [];
  }


  // ============== HELPERS ============== //

  function onConnected() {
    isConnected = true;
    chatConnectButton.disabled = false;
    chatConnectButton.textContent = 'Connect';
    updateChatView();
    resetInactivityTimer();
  }

  // Show the chat when connected, otherwise the start screen or the connect form
  function updateChatView() {
    chatConnectionLost.classList.toggle('hidden', !isConnectionLost);
    chatStart.classList.toggle('hidden', isConnectionLost || isConnected || isStarted);
    chatConnect.classList.toggle('hidden', isConnectionLost || isConnected || !isStarted);
    chatMessages.classList.toggle('hidden', !isConnected);
    chatInputContainer.classList.toggle('hidden', !isConnected);
    updateChatCallout();
    if (isConnected && !chatPopup.classList.contains('hidden')) {
      // Messages added while the popup was hidden (restored history on reload) could not scroll, scroll now it has a layout
      chatMessages.scrollTop = chatMessages.scrollHeight;
      chatInput.focus();
    }
  }

  // Invite the customer to chat only while the popup is closed and no conversation has started yet
  function updateChatCallout() {
    chatCallout.classList.toggle('hidden', !chatPopup.classList.contains('hidden') || !isFirstMessage);
  }

  // Restart the inactivity countdown, called on customer activity (typing, sending) and agent activity (joining, typing, replying).
  // Automatic messages (welcome, long wait) are not activity, so they do not restart it
  function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    const endPrompt = chatRoot.getElementById('chat-end-prompt');
    if (endPrompt) endPrompt.remove();
    if (isConnected) {
      refreshCookies();
      inactivityTimer = setTimeout(showEndChatPrompt, INACTIVITY_DELAY);
    }
  }

  function showEndChatPrompt() {
    // The agent only sends typing when they start and stop, so a long answer can outlast the countdown, wait again until they stop
    if (chatRoot.getElementById('chat-typing')) {
      resetInactivityTimer();
      return;
    }

    const promptElement = document.createElement('div');
    promptElement.id = 'chat-end-prompt';
    promptElement.className = 'flex flex-col items-center mb-3 text-xs text-gray-500';
    promptElement.innerHTML = `
      <span class="mb-2">Do you still need help?</span>
      <button type="button" class="border border-gray-300 text-gray-700 rounded-md px-3 py-1 cursor-pointer">End chat</button>
    `;
    promptElement.querySelector('button').addEventListener('click', endChat);
    chatMessages.appendChild(promptElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  // Show the pill with the given status, hide it for ES_HIDE. The pill keeps it while the popup is closed
  function setChatEmployeeStatus(employeeStatus) {
    chatEmployeeStatus.classList.toggle('hidden', !employeeStatus);
    if (!employeeStatus) return;
    chatEmployeeStatus.dataset.status = employeeStatus;
    chatEmployeeStatusText.textContent = employeeStatus;
  }

  function showSystemMessage(systemMessage) {
    if (!systemMessage || systemMessage == '') return;

    const systemMessageEl = document.createElement('div');
    systemMessageEl.className = 'join-chat flex flex-col items-center mb-3 text-xs text-gray-500';
    systemMessageEl.innerHTML = `<span class="mb-2">${systemMessage}</span>`;
    chatMessages.appendChild(systemMessageEl);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function resetPageTitle() {
    if (numberOfUnreadMessage > 0)
      document.title = `(${numberOfUnreadMessage}) ${NOTIFICATION_TITLE}`;
    else
      document.title = ORIGINAL_TITLE;

    updateUnreadBadge();
  }

  // Unread count on the chat bubble, only shown while the popup is closed
  function updateUnreadBadge() {
    const showBadge = numberOfUnreadMessage > 0 && chatPopup.classList.contains('hidden');
    chatUnreadBadge.textContent = numberOfUnreadMessage > 99 ? '99+' : numberOfUnreadMessage;
    chatUnreadBadge.classList.toggle('hidden', !showBadge);
    chatBubble.classList.toggle('has-unread', showBadge);
  }

  // Typing bubble styled like a reply, only one is shown and it stays at the bottom of the messages
  function showTyping(isTyping, employeeFirstName) {
    let typingElement = chatRoot.getElementById('chat-typing');
    clearTimeout(typingIndicatorTimer);
    if (!isTyping) {
      if (typingElement) typingElement.remove();
      return;
    }

    // The stop typing event can be lost (agent closed their tab), so the bubble hides itself after a while
    typingIndicatorTimer = setTimeout(() => {
      showTyping(false);
      resumeLongWaitTimer();
    }, TYPING_INDICATOR_TIMEOUT);

    var typingMessage = 'Typing...';
    if (employeeFirstName && employeeFirstName != '') {
      typingMessage = `${employeeFirstName} is typing...`;
    }

    if (!typingElement) {
      typingElement = document.createElement('div');
      typingElement.id = 'chat-typing';
      typingElement.className = 'flex flex-col items-start mb-3';
      typingElement.innerHTML = `
        <div class="text-xs text-gray-500 mb-1 ml-1"></div>
        <div class="bg-gray-200 text-gray-600 italic rounded-lg py-2 px-4 max-w-[70%] typing-wave"></div>
      `;
    }

    // One span per letter, each delayed a little more than the previous one to make the wave
    // typingElement.firstElementChild.textContent = senderName;
    const bubbleElement = typingElement.lastElementChild;
    bubbleElement.innerHTML = '';
    [...typingMessage].forEach((letter, index) => {
      const letterElement = document.createElement('span');
      letterElement.textContent = letter === ' ' ? ' ' : letter;
      letterElement.style.animationDelay = `${index * 0.05}s`;
      bubbleElement.appendChild(letterElement);
    });

    // appendChild moves the existing bubble to the bottom
    chatMessages.appendChild(typingElement);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function playNotificationSound() {
    // Rewind to the beginning if it is already playing
    NOTIFICATION_SOUND.currentTime = 0;
    
    // Play the sound
    NOTIFICATION_SOUND.play()
      .catch(error => {
        console.log("Autoplay blocked. ", error);
      });
  }

  async function getRefreshToken() {
    try {
      const oldToken = getCookie(ACCESS_TOKEN_COOKIE);
      if (!oldToken || oldToken == '') throw new Error('Invalid token');

      const response = await fetch(GET_REFRESH_TOKEN_PATH, {
        method: 'POST',
        headers: { 'x-auth-token': oldToken },
      });

      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);

      const result = await response.json();
      setCookie(ACCESS_TOKEN_COOKIE, result.token, COOKIE_MAX_AGE);
      return true;
    } catch (e) {
      return false;
    }
  }

  // ============== COOKIES ============== //

  function setCookie(name, value, maxAge) {
    document.cookie = `${name}=${encodeURIComponent(value)}; max-age=${maxAge}; path=/; SameSite=Lax`;
  }

  function getCookie(name) {
    const cookie = document.cookie.split('; ').find(row => row.startsWith(name + '='));
    return cookie ? decodeURIComponent(cookie.split('=')[1]) : null;
  }

  // Clear all the chat cookies, leaving the host site's own cookies alone
  function clearChatCookies() {
    lastCookieRefresh = 0;
    [SESSION_KEY_COOKIE, CUSTOMER_ID_COOKIE, CUSTOMER_NAME_COOKIE, CONVERSATION_ID_COOKIE, ACCESS_TOKEN_COOKIE]
      .forEach(name => setCookie(name, '', 0));
  }

  function refreshCookies() {
    const now = Date.now();
    if (now - lastCookieRefresh < COOKIE_REFRESH_INTERVAL) return;

    lastCookieRefresh = now;

    [CUSTOMER_ID_COOKIE, CUSTOMER_NAME_COOKIE, CONVERSATION_ID_COOKIE, ACCESS_TOKEN_COOKIE]
      .forEach(name => {
        const value = getCookie(name);
        if (value) setCookie(name, value, COOKIE_MAX_AGE);
      });
  }


  // ============== OTHER HELPERS ============== //

  // Check the total file count against the files already selected, then each file
  function validateFiles(files) {
    if (selectedFiles.length + files.length > MAX_FILES) {
      return `You can attach up to ${MAX_FILES} files at a time.`;
    }
    for (const file of files) {
      const error = validateFile(file);
      if (error) return error;
    }
    return null;
  }

  // Check allowed extensions and max file size
  function validateFile(file) {
    const extension = getFileExtension(file.name);
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      return `${file.name}: file type not allowed. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}.`;
    }
    if (file.size > MAX_FILE_SIZE) {
      return `${file.name} is too large (${formatFileSize(file.size)}). Max size is 5MB.`;
    }
    return null;
  }

  function formatFileSize(bytes) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  }

  function getFileExtension(fileName) {
    return fileName.includes('.') ? fileName.split('.').pop().toLowerCase() : '';
  }

  // 'image' or 'video' when the browser can show the file inline, 'other' otherwise
  function getFileKind(fileName) {
    const extension = getFileExtension(fileName);
    if (IMAGE_EXTENSIONS.includes(extension)) return 'image';
    if (VIDEO_EXTENSIONS.includes(extension)) return 'video';
    return 'other';
  }

  // Files sent by the agent are stored under the user documents, files sent by the customer under the customer documents
  function getS3FileUrl(fileName, isOutbound) {
    const filePath = isOutbound ? S3_USER_FILE_PATH : S3_CUSTOMER_FILE_PATH;
    return `${filePath}/${encodeURIComponent(fileName)}`;
  }

  // Turn S3 file names into the { name, url } files displayed in a message
  function toS3MessageFiles(fileNames, isOutbound) {
    return (fileNames || []).map(fileName => ({ name: fileName, url: getS3FileUrl(fileName, isOutbound) }));
  }

  function clearSelectedFiles() {
    revokeSelectedFilePreviewUrls();
    selectedFiles = [];
    chatFileInput.value = '';
    chatFilePreview.innerHTML = '';
    chatFilePreview.classList.add('hidden');
    chatFileError.classList.add('hidden');
  }

  // Remove dashes, parentheses, and spaces from a phone number
  function sanitizePhone(phone) {
    return phone.replace(/[-()\s]/g, '');
  }

  // US number: 10 digits, area code and exchange cannot start with 0 or 1
  function isValidUSPhone(phone) {
    return /^[2-9]\d{2}[2-9]\d{6}$/.test(phone);
  }

  // Clear the phone error once the user edits the field and format the phone
  chatPhoneInput.addEventListener('input', function(e) {
    chatPhoneInput.setCustomValidity('');

    var x = e.target.value.replace(/\D/g, '').match(/(\d{0,3})(\d{0,3})(\d{0,4})/);
    e.target.value = !x[2] ? x[1] : x[1] + '-' + x[2] + (x[3] ? '-' + x[3] : '');
  });

  // Grow the input with its content, from 1 line up to CHAT_INPUT_MAX_ROWS, then scroll
  function resizeChatInput() {
    // Can't measure while hidden, fall back to rows="1"
    if (chatInput.getClientRects().length === 0) {
      chatInput.style.height = '';
      chatInput.style.overflowY = '';
      return;
    }

    const style = getComputedStyle(chatInput);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
    const padding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
    const extra = style.boxSizing === 'border-box' ? border : -padding;
    const maxHeight = lineHeight * CHAT_INPUT_MAX_ROWS + padding + extra;

    chatInput.style.height = 'auto';
    const contentHeight = chatInput.scrollHeight + extra;
    chatInput.style.height = Math.min(contentHeight, maxHeight) + 'px';
    chatInput.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden';
  }


})();
