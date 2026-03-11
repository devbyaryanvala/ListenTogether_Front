import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { socket } from '../webrtc/socket';
import { STUN_SERVERS } from '../webrtc/constants';
import { Mic, MicOff, Users, Play, AlertCircle, Copy, CheckCircle2, Radio, Headphones, SkipBack, SkipForward, Pause, Volume2, VolumeX } from 'lucide-react';

const RoomPage = () => {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const role = searchParams.get('role'); // 'host' or 'listener'
  const navigate = useNavigate();

  const [status, setStatus] = useState('Initializing...');
  const [isStreaming, setIsStreaming] = useState(false);
  const [listenerConnected, setListenerConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorDetails, setErrorDetails] = useState('');

  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const audioRef = useRef(null);

// Add state for currently playing song
  const [currentSong, setCurrentSong] = useState('');
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const connectedUserIdRef = useRef(null);

// Add state for host notifications
  const [hostNotification, setHostNotification] = useState('');
  const notificationTimeoutRef = useRef(null);

  useEffect(() => {
    if (!roomId || !role) {
      navigate('/');
      return;
    }

    socket.connect();
    setStatus('Connecting to server...');

    socket.on('connect', () => {
      setStatus(`Connected as ${role}`);
      if (role === 'host') {
        socket.emit('create-room', roomId);
      } else {
        socket.emit('join-room', roomId);
      }
    });

    socket.on('error', (err) => {
      setStatus('Error');
      setErrorDetails(err);
    });

    socket.on('user-connected', async (userId) => {
      console.log('User connected:', userId);
      if (role === 'host') {
        connectedUserIdRef.current = userId;
        setListenerConnected(true);
        setStatus('Listener joined! Ready to stream.');
        // Broadcast the current song in case they joined mid-stream
        if (currentSong) {
          socket.emit('song-changed', { roomId, songName: currentSong });
        }
        // If host is already streaming when listener connects, renegotiate
        if (localStreamRef.current) {
          await initiateOffer(userId);
        }
      }
    });

    socket.on('user-disconnected', (userId) => {
      if (role === 'host') {
        if (!connectedUserIdRef.current || connectedUserIdRef.current === userId) {
          setListenerConnected(false);
          setStatus('Listener disconnected.');
          connectedUserIdRef.current = null;
          if (peerConnectionRef.current) {
            peerConnectionRef.current.close();
            peerConnectionRef.current = null;
          }
        }
      } else {
        setStatus('Host disconnected.');
        setCurrentSong(''); // clear song if host leaves
        if (peerConnectionRef.current) {
          peerConnectionRef.current.close();
          peerConnectionRef.current = null;
        }
      }
    });

    // Metadata Handlers
    socket.on('song-changed', (songName) => {
      setCurrentSong(songName);
    });

    socket.on('playback-control', (action) => {
      if (role === 'host') {
        let msg = '';
        if (action === 'play') msg = 'Listener wants to PLAY';
        if (action === 'pause') msg = 'Listener wants to PAUSE';
        if (action === 'next') msg = 'Listener requested NEXT Track!';
        if (action === 'previous') msg = 'Listener requested PREVIOUS Track!';
        
        setHostNotification(msg);
        if (notificationTimeoutRef.current) clearTimeout(notificationTimeoutRef.current);
        notificationTimeoutRef.current = setTimeout(() => {
          setHostNotification('');
        }, 4000);
      }
    });

    // WebRTC Signaling handlers
    socket.on('offer', async (payload) => {
      if (role !== 'listener') return;
      
      console.log('Received offer');
      setStatus('Receiving audio stream...');
      
      try {
        const pc = createPeerConnection(payload.caller);
        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        socket.emit('answer', {
          target: payload.caller,
          sdp: pc.localDescription
        });
      } catch (err) {
        console.error('Error handling offer:', err);
        setStatus('Error connecting WebRTC');
      }
    });

    socket.on('answer', async (payload) => {
      if (role !== 'host' || !peerConnectionRef.current) return;
      console.log('Received answer');
      try {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      } catch (err) {
        console.error('Error handling answer:', err);
      }
    });

    socket.on('ice-candidate', async (payload) => {
      try {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
        }
      } catch (err) {
        console.error('Error adding received ice candidate', err);
      }
    });

    return () => {
      socket.disconnect();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
      }
      socket.off('connect');
      socket.off('error');
      socket.off('user-connected');
      socket.off('user-disconnected');
      socket.off('song-changed');
      socket.off('playback-control');
      socket.off('offer');
      socket.off('answer');
      socket.off('ice-candidate');
    };
  }, [roomId, role, navigate]);

  // Use a ref and a timeout for simple debouncing of the broadbast
  const [songInput, setSongInput] = useState('');
  const typingTimeoutRef = useRef(null);
  
  const handleHostSongChange = (e) => {
    const newVal = e.target.value;
    setSongInput(newVal);
    setCurrentSong(newVal); // update local state immediately
    
    // Clear previous timeout and set a new one to broadcast (debouncing)
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('song-changed', { roomId, songName: newVal });
    }, 500);
  };

  const handleRemoteControl = (action) => {
    socket.emit('playback-control', { roomId, action });
  };

  const createPeerConnection = (targetUserId) => {
    const pc = new RTCPeerConnection(STUN_SERVERS);
    peerConnectionRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', {
          target: targetUserId,
          candidate: event.candidate,
        });
      }
    };

    if (role === 'host' && localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current);
      });
    }

    if (role === 'listener') {
      pc.ontrack = (event) => {
        console.log('Received track');
        if (audioRef.current) {
          audioRef.current.srcObject = event.streams[0];
          audioRef.current.play().then(() => {
            setStatus('Playing live audio!');
          }).catch(err => {
            console.warn('Autoplay blocked:', err);
            setAutoplayBlocked(true);
            setStatus('Ready to play. Click below to start.');
          });
        }
      };
    }

    pc.onconnectionstatechange = () => {
      console.log('Connection state:', pc.connectionState);
      if (pc.connectionState === 'connected' && role === 'listener') {
        setStatus('Connected! Playing audio.');
      } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        setStatus('Connection lost.');
      }
    };

    return pc;
  };

  const initiateOffer = async (targetUserId) => {
    try {
      const pc = createPeerConnection(targetUserId);
      const offer = await pc.createOffer();
      
      // Munge SDP to force Opus codec into high-quality stereo mode (default is optimized for low-bitrate mono voice)
      // This ensures the music sounds perfect.
      offer.sdp = offer.sdp.replace('useinbandfec=1', 'useinbandfec=1; stereo=1; sprop-stereo=1; maxaveragebitrate=510000');
      
      await pc.setLocalDescription(offer);
      
      socket.emit('offer', {
        target: targetUserId,
        sdp: pc.localDescription
      });
    } catch (err) {
      console.error('Error initiating offer:', err);
      setStatus('Failed to start streaming');
    }
  };

  const startStreaming = async () => {
    try {
      setStatus('Waiting for tab selection...');
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000,
          channelCount: 2
        }
      });

      // Check if user shared audio
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getTracks().forEach(track => track.stop());
        throw new Error('No audio selected. Please make sure to "Share tab audio".');
      }

      // We only want to stream audio. Stop video tracks to save bandwidth and privacy.
      stream.getVideoTracks().forEach(track => track.stop());

      // Create a new stream with only audio
      const audioOnlyStream = new MediaStream([audioTracks[0]]);
      localStreamRef.current = audioOnlyStream;
      setIsStreaming(true);
      setStatus('Capturing audio. Waiting for listener to connect...');

      // Stop stream if user stops sharing via browser UI
      audioTracks[0].onended = () => {
        setIsStreaming(false);
        setStatus('Stream stopped.');
        if (peerConnectionRef.current) {
          peerConnectionRef.current.close();
          peerConnectionRef.current = null;
        }
      };

      // If a listener is already connected, initiate offer immediately
      if (listenerConnected) {
        // We broadcast to all in room, but for MVP we assume 1 listener
        // The robust way is to ask server who is in the room, but we'll negotiate on next join or handle it via 'user-connected'
        // For simple MVP 1v1, if listener connected before stream, the host needs a way to trigger offer
        // In real app, we'd iterate over all connected peers
        setStatus('Audio captured. Streams will connect when listener joins or is ready.');
      }

    } catch (err) {
      console.error('Error accessing display media:', err);
      setStatus('Failed to capture audio.');
      setErrorDetails(err.message || 'Permission denied.');
    }
  };

  const copyLink = () => {
    const link = `${window.location.origin}/?join=${roomId}`; // User can put in landing or direct link
    // Actually we'll just give them the code
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleLocalMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !audioRef.current.muted;
      // Force re-render to update icon
      setStatus(status + ' ');
      setTimeout(() => setStatus(status.trim()), 0);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="max-w-md w-full glass-card p-8 rounded-2xl space-y-8 animate-in slide-in-from-bottom-8 duration-500 relative">
        
        {/* Host Notification Popup */}
        {hostNotification && (
          <div className="absolute -top-16 left-0 right-0 p-4 bg-accent/90 backdrop-blur-md rounded-xl text-white font-bold text-center shadow-lg animate-in slide-in-from-top-4 fade-in duration-300 z-50 flex items-center justify-center gap-2">
            <Radio className="w-5 h-5 animate-pulse" />
            {hostNotification}
          </div>
        )}

        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold">Listening Room</h2>
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-800/50 rounded-full border border-slate-700">
            <span className="text-slate-400 text-sm">Room ID:</span>
            <span className="font-mono font-bold text-primary">{roomId}</span>
            <button 
              onClick={copyLink}
              className="ml-2 text-slate-400 hover:text-white transition-colors"
              title="Copy Room ID"
            >
              {copied ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div className="p-4 bg-slate-900/50 rounded-xl border border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${status.includes('Error') ? 'bg-red-500' : 'bg-green-500'} animate-pulse`} />
            <span className="text-sm font-medium text-slate-300">{status}</span>
          </div>
          {role === 'host' && (
            <div className="flex items-center gap-2 text-sm">
              <Users className={`w-4 h-4 ${listenerConnected ? 'text-primary' : 'text-slate-500'}`} />
              <span className={listenerConnected ? 'text-primary font-medium' : 'text-slate-500'}>
                {listenerConnected ? '1 Listener' : 'Waiting...'}
              </span>
            </div>
          )}
        </div>

        {errorDetails && (
          <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 text-red-400 text-sm">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>{errorDetails}</p>
          </div>
        )}

        {role === 'host' ? (
          <div className="space-y-4">
            <div className="space-y-2 text-left">
              <label htmlFor="songName" className="text-sm font-medium text-slate-300">Now Playing (Optional)</label>
              <input 
                id="songName"
                type="text" 
                placeholder="Type the song name to sync with listener..."
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
                value={songInput}
                onChange={handleHostSongChange}
              />
            </div>
            {!isStreaming ? (
              <button 
                onClick={startStreaming}
                className="w-full bg-primary text-white hover:bg-primary/90 py-4 rounded-xl font-medium flex items-center justify-center gap-2 shadow-lg transition-all"
              >
                <Mic className="w-5 h-5" />
                Start Streaming Audio
              </button>
            ) : (
              <div className="p-6 bg-primary/10 border border-primary/20 rounded-xl text-center space-y-4">
                <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center mx-auto animate-pulse">
                  <Radio className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium text-lg text-primary">Streaming Active</h3>
                  <p className="text-sm text-slate-400 mt-1">Your tab audio is currently being shared.</p>
                </div>
              </div>
            )}
            <p className="text-xs text-slate-500 text-center px-4">
              When prompted, completely select the <strong>YouTube Music tab</strong> and make sure <strong>"Share tab audio"</strong> is checked.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {currentSong && (
              <div className="p-4 bg-slate-900/50 border border-slate-700/50 rounded-xl text-center space-y-1 animate-in slide-in-from-top-4 duration-500">
                <p className="text-xs text-slate-400 uppercase tracking-wider font-semibold">Now Playing</p>
                <p className="font-medium text-white text-lg">{currentSong}</p>
              </div>
            )}
            <div className="relative group overflow-hidden rounded-2xl bg-slate-900 border border-slate-800 aspect-video flex flex-col items-center justify-center">
              <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-accent/10 opacity-50" />
              
              <div className="relative z-10 flex flex-col items-center gap-4">
                <div className={`p-6 rounded-full ${status.includes('Playing') && !audioRef.current?.muted ? 'bg-primary/20 shadow-[0_0_30px_rgba(59,130,246,0.3)] animate-pulse' : 'bg-slate-800'}`}>
                  {status.includes('Playing') ? (
                    <Headphones className="w-12 h-12 text-primary" />
                  ) : (
                    <MicOff className="w-12 h-12 text-slate-500" />
                  )}
                </div>
                <p className="text-sm font-medium text-slate-300 px-8 text-center h-5">
                  {status.includes('Playing') ? 'Playing live from host synced perfectly...' : status}
                </p>
                
                {/* Listener Controls */}
                <div className="mt-4 flex items-center gap-4 bg-slate-800/80 backdrop-blur-md p-3 rounded-full border border-slate-700">
                  <button onClick={() => toggleLocalMute()} className="p-2 hover:bg-slate-700 rounded-full text-slate-300 transition-colors" title="Mute/Unmute locally">
                     {audioRef.current?.muted ? <VolumeX className="w-5 h-5 text-red-400" /> : <Volume2 className="w-5 h-5 hover:text-white" />}
                  </button>
                  <div className="w-px h-6 bg-slate-700"></div>
                  <button onClick={() => handleRemoteControl('previous')} className="p-2 hover:bg-slate-700 rounded-full text-slate-300 hover:text-white transition-colors" title="Request Previous Track">
                    <SkipBack className="w-5 h-5" />
                  </button>
                  <button onClick={() => handleRemoteControl('pause')} className="p-3 bg-primary hover:bg-primary/90 text-white rounded-full shadow-lg hover:scale-105 transition-all" title="Request Pause">
                    <Pause className="w-5 h-5 fill-current" />
                  </button>
                  <button onClick={() => handleRemoteControl('play')} className="p-3 bg-primary hover:bg-primary/90 text-white rounded-full shadow-lg hover:scale-105 transition-all" title="Request Play">
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  </button>
                  <button onClick={() => handleRemoteControl('next')} className="p-2 hover:bg-slate-700 rounded-full text-slate-300 hover:text-white transition-colors" title="Request Next Track">
                    <SkipForward className="w-5 h-5" />
                  </button>
                </div>

                {autoplayBlocked && (
                  <button 
                    onClick={() => {
                      if (audioRef.current) {
                        audioRef.current.play();
                        setAutoplayBlocked(false);
                        setStatus('Playing live audio!');
                      }
                    }}
                    className="absolute bottom-4 bg-primary text-white py-2 px-6 rounded-full font-medium flex items-center gap-2 shadow-lg hover:bg-primary/90 transition-all cursor-pointer z-20"
                  >
                    <Play className="w-4 h-4" />
                    Play Audio
                  </button>
                )}
              </div>

              {/* Autoplay requires user interaction in some browsers, but often WebRTC streams bypass if there's no video, or we add controls. To be safe, adding basic audio element */}
              <audio ref={audioRef} autoPlay controls={false} className="hidden" />
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default RoomPage;
