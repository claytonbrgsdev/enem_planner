import React, { useState, useEffect } from 'react';
import useTime from '../hooks/useTime';

interface SplashScreenProps {
  onFinished: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onFinished }) => {
  const { greeting } = useTime();
  const [fadingOut, setFadingOut] = useState(false);

  useEffect(() => {
    const fadeOutTimer = setTimeout(() => {
      setFadingOut(true);
    }, 2500); // Start fading out after 2.5s

    const unmountTimer = setTimeout(() => {
      onFinished();
    }, 3500); // Unmount after 3.5s (allowing 1s for fade-out)

    return () => {
      clearTimeout(fadeOutTimer);
      clearTimeout(unmountTimer);
    };
  }, [onFinished]);

  return (
    <div
      className={`fixed inset-0 bg-gray-900 flex items-center justify-center z-50 transition-opacity duration-1000 ${fadingOut ? 'opacity-0' : 'opacity-100'}`}
    >
      <h1 className="text-4xl md:text-6xl font-extrabold text-indigo-300 tracking-wider uppercase text-center animate-fade-in-down px-4">
        {greeting}
      </h1>
    </div>
  );
};

export default SplashScreen;
