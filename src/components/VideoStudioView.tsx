import React, { useState } from 'react';
import { Clapperboard, Download, Film, ImagePlus, Upload } from 'lucide-react';
import { Product } from '../types';
import { apiRequest } from '../lib/api';
import { ResilientImage } from './ResilientImage';

interface VideoStudioViewProps {
  products: Product[];
  onBack: () => void;
}

const PRESET_PROMPTS = [
  'Smooth cinematic studio turntable orbit with crisp rim highlights and subtle ambient depth.',
  'Gentle handheld close-up push-in highlighting brushed metal textures and soft natural shadows.',
  'Clean architectural product reveal with slow lateral dolly movement and editorial lighting.',
];

export const VideoStudioView: React.FC<VideoStudioViewProps> = ({ products, onBack }) => {
  const [imageDataUrl, setImageDataUrl] = useState<string>('');
  const [imageMimeType, setImageMimeType] = useState<string>('image/jpeg');
  const [imageLabel, setImageLabel] = useState<string>('');
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [duration, setDuration] = useState<'5s' | '10s'>('5s');
  const [prompt, setPrompt] = useState(PRESET_PROMPTS[0]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [videoSrc, setVideoSrc] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setVideoSrc('');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setImageDataUrl(reader.result);
        setImageMimeType(file.type || 'image/jpeg');
        setImageLabel(file.name);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSelectCatalogProduct = async (product: Product) => {
    setError('');
    setVideoSrc('');
    try {
      const response = await fetch(product.image_url);
      if (!response.ok) throw new Error('Unable to load product image');
      const blob = await response.blob();
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setImageDataUrl(reader.result);
          setImageMimeType(blob.type || 'image/jpeg');
          setImageLabel(product.title);
        }
      };
      reader.readAsDataURL(blob);
    } catch {
      setError('Could not read selected catalog image into studio buffer. Please upload a local image file.');
    }
  };

  const handleGenerateVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageDataUrl) {
      setError('Please upload a photo or pick a catalog product photo first.');
      return;
    }

    setGenerating(true);
    setError('');
    setVideoSrc('');

    try {
      const res = await apiRequest<{
        videoBase64?: string;
        videoUri?: string;
        mimeType?: string;
      }>('/api/ai/animate-video', {
        method: 'POST',
        body: JSON.stringify({
          imageBase64: imageDataUrl,
          mimeType: imageMimeType,
          prompt,
          aspectRatio,
          duration,
        }),
      });

      if (res.videoBase64) {
        setVideoSrc(`data:${res.mimeType || 'video/mp4'};base64,${res.videoBase64}`);
      } else if (res.videoUri) {
        setVideoSrc(res.videoUri);
      } else {
        setError('Video generation completed without a playable video payload.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to animate image into video.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Product Motion Studio</h1>
          <p className="text-sm text-slate-500 mt-1">
            Upload a still photo or choose a catalog item and animate it into a 16:9 landscape or 9:16 portrait video.
          </p>
        </div>
        <button
          type="button"
          onClick={onBack}
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          Back to Shop
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <form
          onSubmit={handleGenerateVideo}
          className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5"
        >
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-slate-700">1. Source Image</label>
            <label className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-slate-200 hover:border-blue-500 rounded-xl bg-slate-50 cursor-pointer transition-colors">
              <Upload className="w-5 h-5 text-slate-500" />
              <div className="text-xs font-medium text-slate-700">
                {imageLabel ? `Loaded: ${imageLabel}` : 'Click to upload JPG, PNG, or WebP photo'}
              </div>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-700">
              Or pick a catalog product photo
            </div>
            <div className="grid grid-cols-4 gap-2">
              {products.slice(0, 4).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelectCatalogProduct(p)}
                  className={`group rounded-lg overflow-hidden border text-left transition-colors ${
                    imageLabel === p.title
                      ? 'border-blue-600 ring-1 ring-blue-600'
                      : 'border-slate-200 hover:border-slate-400'
                  }`}
                >
                  <div className="aspect-[4/3] bg-slate-100">
                    <ResilientImage
                      src={p.image_url}
                      alt={p.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-1.5 text-[10px] font-medium text-slate-700 truncate">
                    {p.title}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700">2. Aspect Ratio</div>
              <div className="grid grid-cols-2 gap-2">
                {(['16:9', '9:16'] as const).map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => setAspectRatio(ratio)}
                    className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors ${
                      aspectRatio === ratio
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    {ratio === '16:9' ? '16:9 Landscape' : '9:16 Portrait'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-700">3. Clip Duration</div>
              <div className="grid grid-cols-2 gap-2">
                {(['5s', '10s'] as const).map((dur) => (
                  <button
                    key={dur}
                    type="button"
                    onClick={() => setDuration(dur)}
                    className={`py-2 px-3 text-xs font-semibold rounded-lg border transition-colors font-mono ${
                      duration === dur
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    {dur}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="motion-prompt" className="block text-xs font-semibold text-slate-700">
              4. Motion Direction Prompt
            </label>
            <textarea
              id="motion-prompt"
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe camera movement, lighting, and subject motion..."
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:border-blue-600"
            />
            <div className="flex flex-wrap gap-1.5">
              {PRESET_PROMPTS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setPrompt(preset)}
                  className="text-[11px] px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700"
                >
                  Preset {idx + 1}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-xs text-red-700 rounded-lg leading-relaxed">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={generating || !imageDataUrl}
            className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            <Clapperboard className="w-4 h-4" />
            {generating ? 'Generating Video (this may take a moment)...' : 'Animate Image into Video'}
          </button>
        </form>

        {/* Preview Column */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Studio Preview</h2>
            <span className="text-xs font-mono text-slate-500">
              {aspectRatio} · {duration}
            </span>
          </div>

          {videoSrc ? (
            <div className="space-y-4">
              <div
                className={`bg-slate-950 rounded-xl overflow-hidden flex items-center justify-center mx-auto ${
                  aspectRatio === '9:16' ? 'max-w-[280px] aspect-[9/16]' : 'w-full aspect-video'
                }`}
              >
                <video
                  src={videoSrc}
                  controls
                  autoPlay
                  loop
                  playsInline
                  className="w-full h-full object-contain"
                />
              </div>
              <a
                href={videoSrc}
                download={`omnimart-motion-${aspectRatio.replace(':', 'x')}.mp4`}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg"
              >
                <Download className="w-4 h-4" />
                Download Video (MP4)
              </a>
            </div>
          ) : imageDataUrl ? (
            <div className="space-y-3">
              <div
                className={`bg-slate-100 rounded-xl overflow-hidden mx-auto ${
                  aspectRatio === '9:16' ? 'max-w-[280px] aspect-[9/16]' : 'w-full aspect-video'
                }`}
              >
                <img
                  src={imageDataUrl}
                  alt={imageLabel || 'Source preview'}
                  className="w-full h-full object-cover"
                />
              </div>
              <p className="text-xs text-slate-500 text-center">
                {generating
                  ? 'Rendering video motion frames from your still photo...'
                  : 'Source image ready. Click Animate Image into Video to render.'}
              </p>
            </div>
          ) : (
            <div className="aspect-video bg-slate-50 border border-slate-200 rounded-xl flex flex-col items-center justify-center gap-2 text-center p-6">
              <div className="flex items-center gap-2 text-slate-400">
                <ImagePlus className="w-6 h-6" />
                <Film className="w-6 h-6" />
              </div>
              <div className="text-sm font-medium text-slate-700">No source image selected</div>
              <p className="text-xs text-slate-500 max-w-xs">
                Upload a photo from your device or click one of the catalog product thumbnails on the left.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
