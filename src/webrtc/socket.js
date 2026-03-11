import { io } from 'socket.io-client';

// Use the current hostname so devices on the local network connect to the correct IP
const URL = import.meta.env.VITE_SERVER_URL || `http://${window.location.hostname}:5000`;

export const socket = io(URL, {
  autoConnect: false,
});
