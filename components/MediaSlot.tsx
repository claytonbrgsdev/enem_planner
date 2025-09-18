import React, { useState } from 'react';

const LOCAL_VIDEO_URL = "/assets/video_telinha.mp4";
const FALLBACK_VIDEO_URL = "https://videos.pexels.com/video-files/3120282/3120282-hd_1920_1080_25fps.mp4";

const MediaSlot: React.FC = () => {
  const [videoSrc, setVideoSrc] = useState(LOCAL_VIDEO_URL);
  const [error, setError] = useState<string | null>(null);

  const handleError = () => {
    console.error(`====== DEBUG GIO ======`);
    console.error(`Falha ao carregar o vídeo em: ${videoSrc}`);
    
    if (videoSrc === LOCAL_VIDEO_URL) {
      console.warn("Vídeo local não encontrado. Tentando carregar vídeo de fallback online...");
      setVideoSrc(FALLBACK_VIDEO_URL);
    } else {
      console.error("O vídeo de fallback também falhou ao carregar.");
      setError("Não foi possível carregar o vídeo de fundo.");
    }
  };

  return (
    <div className="rounded-lg overflow-hidden shadow-lg border border-gray-700 h-full w-full bg-gray-900 flex items-center justify-center">
      {error ? (
        <p className="text-gray-400 text-center px-4">{error}</p>
      ) : (
        <video
          key={videoSrc} // Using key to force re-render on src change, especially for the fallback
          className="w-full h-full object-cover"
          src={videoSrc}
          autoPlay
          loop
          muted
          playsInline
          onError={handleError}
        />
      )}
    </div>
  );
};

export default MediaSlot;