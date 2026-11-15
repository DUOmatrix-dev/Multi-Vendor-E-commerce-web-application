import React, { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Send, Volume2, X, Headphones } from 'lucide-react';

interface TranscriptEntry {
  id: string;
  speaker: 'you' | 'concierge' | 'system';
  text: string;
}

interface LiveVoiceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export const LiveVoiceDrawer: React.FC<LiveVoiceDrawerProps> = ({ isOpen, onClose }) => {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('Connect to start a live voice conversation about catalog products, shipping, or OmniMart Rewards.');
  const [muted, setMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const mutedRef = useRef<boolean>(false);
  const transcriptEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  const stopPlaybackQueue = () => {
    for (const source of activeSourcesRef.current) {
      try {
        source.stop();
      } catch {
        // ignore already stopped source
      }
    }
    activeSourcesRef.current.clear();
    if (outputCtxRef.current) {
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
    setIsSpeaking(false);
  };

  const cleanupSession = () => {
    stopPlaybackQueue();

    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {
        // ignore
      }
      processorRef.current.onaudioprocess = null;
      processorRef.current = null;
    }

    if (micStreamRef.current) {
      for (const track of micStreamRef.current.getTracks()) {
        track.stop();
      }
      micStreamRef.current = null;
    }

    if (inputCtxRef.current) {
      inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }

    if (outputCtxRef.current) {
      outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      cleanupSession();
    };
  }, []);

  const appendTranscript = (speaker: 'you' | 'concierge' | 'system', chunk: string) => {
    const clean = chunk;
    if (!clean) return;
    setTranscript((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.speaker === speaker && speaker !== 'system') {
        return [
          ...prev.slice(0, -1),
          { ...last, text: `${last.text}${last.text.endsWith(' ') || clean.startsWith(' ') ? '' : ' '}${clean}`.trimStart() },
        ];
      }
      return [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          speaker,
          text: clean.trimStart(),
        },
      ];
    });
  };

  const playPcm24kChunk = async (base64Pcm: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const bytes = base64ToUint8Array(base64Pcm);
    const sampleCount = Math.floor(bytes.byteLength / 2);
    if (sampleCount === 0) return;

    const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const audioBuffer = ctx.createBuffer(1, sampleCount, 24000);
    const channelData = audioBuffer.getChannelData(0);

    for (let i = 0; i < sampleCount; i++) {
      channelData[i] = dataView.getInt16(i * 2, true) / 32768;
    }

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startAt = Math.max(now, nextStartTimeRef.current);
    nextStartTimeRef.current = startAt + audioBuffer.duration;

    activeSourcesRef.current.add(source);
    setIsSpeaking(true);

    source.onended = () => {
      activeSourcesRef.current.delete(source);
      if (activeSourcesRef.current.size === 0) {
        setIsSpeaking(false);
      }
    };

    source.start(startAt);
  };

  const handleStartSession = async () => {
    cleanupSession();
    setStatus('connecting');
    setStatusMessage('Requesting microphone access and opening live voice session...');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      micStreamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      if (inputCtx.state === 'suspended') await inputCtx.resume();
      if (outputCtx.state === 'suspended') await outputCtx.resume();
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${wsProtocol}//${window.location.host}/api/live-voice`);
      wsRef.current = ws;

      ws.onopen = () => {
        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (event) => {
          if (mutedRef.current || ws.readyState !== WebSocket.OPEN) return;
          const floatSamples = event.inputBuffer.getChannelData(0);
          const pcmBuffer = new ArrayBuffer(floatSamples.length * 2);
          const view = new DataView(pcmBuffer);
          for (let i = 0; i < floatSamples.length; i++) {
            const clamped = Math.max(-1, Math.min(1, floatSamples[i]));
            view.setInt16(i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
          }
          ws.send(
            JSON.stringify({
              type: 'audio',
              data: arrayBufferToBase64(pcmBuffer),
            })
          );
        };

        source.connect(processor);
        processor.connect(inputCtx.destination);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as {
            type?: string;
            data?: string;
            text?: string;
            message?: string;
          };

          if (msg.type === 'ready') {
            setStatus('live');
            setStatusMessage('Connected · Speak naturally or type a question below.');
            appendTranscript('system', 'Voice concierge connected.');
          } else if (msg.type === 'audio' && msg.data) {
            playPcm24kChunk(msg.data);
          } else if (msg.type === 'input_transcript' && msg.text) {
            appendTranscript('you', msg.text);
          } else if (msg.type === 'output_transcript' && msg.text) {
            appendTranscript('concierge', msg.text);
          } else if (msg.type === 'interrupted') {
            stopPlaybackQueue();
          } else if (msg.type === 'error') {
            setStatus('error');
            setStatusMessage(msg.message || 'Voice session error occurred.');
            cleanupSession();
          } else if (msg.type === 'closed') {
            setStatus((prev) => (prev === 'error' ? 'error' : 'idle'));
            setStatusMessage('Voice session ended.');
            cleanupSession();
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onerror = () => {
        setStatus('error');
        setStatusMessage('WebSocket connection to live voice service failed.');
        cleanupSession();
      };

      ws.onclose = () => {
        setStatus((prev) => (prev === 'live' ? 'idle' : prev));
      };
    } catch (err) {
      cleanupSession();
      setStatus('error');
      setStatusMessage(
        err instanceof Error
          ? `Microphone or audio setup failed: ${err.message}`
          : 'Unable to access microphone for live voice.'
      );
    }
  };

  const handleEndSession = () => {
    cleanupSession();
    setStatus('idle');
    setStatusMessage('Session ended. Click Start Voice Session to reconnect.');
  };

  const handleSendText = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = textInput.trim();
    if (!cleaned || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: 'text', text: cleaned }));
    appendTranscript('you', cleaned);
    setTextInput('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white h-full border-l border-slate-200 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <Headphones className="w-5 h-5 text-blue-600" />
            <div>
              <h2 className="text-base font-semibold text-slate-900">Voice Shopping Concierge</h2>
              <div className="text-[11px] text-slate-500">
                Real-time two-way audio · OmniMart catalog assistant
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              handleEndSession();
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
            aria-label="Close voice concierge"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Banner */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-800">
              {status === 'live'
                ? isSpeaking
                  ? 'Concierge Speaking'
                  : muted
                  ? 'Microphone Muted'
                  : 'Listening Live (16 kHz PCM)'
                : status === 'connecting'
                ? 'Connecting...'
                : status === 'error'
                ? 'Connection Issue'
                : 'Ready to Connect'}
            </span>
            {status === 'live' && (
              <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                <Volume2 className="w-3.5 h-3.5" />
                Audio Active
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 leading-relaxed">{statusMessage}</p>

          <div className="flex items-center gap-2">
            {status !== 'live' ? (
              <button
                type="button"
                disabled={status === 'connecting'}
                onClick={handleStartSession}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-900 hover:bg-blue-600 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                <Mic className="w-4 h-4" />
                {status === 'connecting' ? 'Connecting...' : 'Start Voice Session'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setMuted((m) => !m)}
                  className={`flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold rounded-lg border transition-colors ${
                    muted
                      ? 'bg-amber-50 border-amber-300 text-amber-800'
                      : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-100'
                  }`}
                >
                  {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  {muted ? 'Unmute Mic' : 'Mute Mic'}
                </button>
                <button
                  type="button"
                  onClick={handleEndSession}
                  className="inline-flex items-center justify-center gap-1.5 py-2.5 px-4 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  <PhoneOff className="w-4 h-4" />
                  End
                </button>
              </>
            )}
          </div>
        </div>

        {/* Live Transcript Feed */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {transcript.length === 0 ? (
            <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs text-slate-600">
              <div className="font-semibold text-slate-900">Try asking out loud:</div>
              <ul className="space-y-1.5 text-slate-500">
                <li>"Compare your mechanical keyboards and studio headphones."</li>
                <li>"How do OmniMart Rewards points work at checkout?"</li>
                <li>"What qualifies for free express shipping?"</li>
              </ul>
            </div>
          ) : (
            transcript.map((entry) => (
              <div
                key={entry.id}
                className={`p-3.5 rounded-xl text-sm leading-relaxed ${
                  entry.speaker === 'you'
                    ? 'bg-slate-900 text-white ml-6'
                    : entry.speaker === 'concierge'
                    ? 'bg-slate-50 border border-slate-200 text-slate-800 mr-6'
                    : 'bg-blue-50 border border-blue-100 text-blue-800 text-xs text-center'
                }`}
              >
                {entry.speaker !== 'system' && (
                  <div
                    className={`text-[10px] font-semibold uppercase tracking-wide mb-1 ${
                      entry.speaker === 'you' ? 'text-slate-300' : 'text-slate-500'
                    }`}
                  >
                    {entry.speaker === 'you' ? 'You' : 'OmniMart Concierge'}
                  </div>
                )}
                <div>{entry.text}</div>
              </div>
            ))
          )}
          <div ref={transcriptEndRef} />
        </div>

        {/* Optional Text Prompt Input While Live */}
        <form onSubmit={handleSendText} className="p-4 border-t border-slate-200 bg-slate-50 flex gap-2">
          <input
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            disabled={status !== 'live'}
            placeholder={
              status === 'live'
                ? 'Or type a message into the live voice session...'
                : 'Start voice session to chat...'
            }
            className="flex-1 px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600 disabled:bg-slate-100"
          />
          <button
            type="submit"
            disabled={status !== 'live' || !textInput.trim()}
            className="px-3.5 py-2 bg-slate-900 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-40"
            aria-label="Send text message"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
