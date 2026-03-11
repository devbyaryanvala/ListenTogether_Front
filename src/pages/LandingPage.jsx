import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Headphones, Users, Play, Radio } from 'lucide-react';

const LandingPage = () => {
  const [roomId, setRoomId] = useState('');
  const navigate = useNavigate();

  const handleCreateRoom = () => {
    // Generate a simple random room ID
    const newRoomId = Math.random().toString(36).substring(2, 8);
    navigate(`/room/${newRoomId}?role=host`);
  };

  const handleJoinRoom = (e) => {
    e.preventDefault();
    if (roomId.trim()) {
      navigate(`/room/${roomId}?role=listener`);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="max-w-md w-full glass-card p-8 rounded-2xl text-center space-y-8 animate-in fade-in zoom-in duration-500">
        
        <div className="space-y-4">
          <div className="flex justify-center">
            <div className="p-4 bg-primary/20 rounded-full animate-pulse shadow-[0_0_30px_rgba(59,130,246,0.5)]">
              <Headphones className="w-12 h-12 text-primary" />
            </div>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Listen Together</h1>
          <p className="text-slate-400">Sync your music in real-time, no account needed for listeners.</p>
        </div>

        <div className="pt-4 space-y-4 border-t border-slate-700/50">
          <button 
            onClick={handleCreateRoom}
            className="w-full relative group overflow-hidden rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-all font-semibold py-4 px-6 flex items-center justify-center gap-2 shadow-lg hover:shadow-primary/25"
          >
            <Radio className="w-5 h-5" />
            <span>Create Listening Room</span>
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
          </button>
        </div>

        <div className="relative py-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-700/50"></div>
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-[var(--color-card)] text-slate-400">or</span>
          </div>
        </div>

        <form onSubmit={handleJoinRoom} className="space-y-4">
          <div className="space-y-2 text-left">
            <label htmlFor="roomId" className="text-sm font-medium text-slate-300">Join Existing Room</label>
            <input 
              id="roomId"
              type="text" 
              placeholder="Enter Room Code"
              className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value)}
            />
          </div>
          <button 
            type="submit"
            disabled={!roomId.trim()}
            className="w-full bg-slate-800 text-white hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all py-3 rounded-xl font-medium flex items-center justify-center gap-2"
          >
            <Users className="w-5 h-5" />
            Join Room
          </button>
        </form>

      </div>
    </div>
  );
};

export default LandingPage;
