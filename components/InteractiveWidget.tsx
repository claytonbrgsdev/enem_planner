import React, { useState, useEffect, useRef, useCallback } from 'react';

const InteractiveWidget: React.FC = () => {
  const [rotation, setRotation] = useState({ x: -20, y: 0 });
  const isDraggingRef = useRef(false);
  const prevMousePosRef = useRef({ x: 0, y: 0 });
  const animationFrameId = useRef<number | null>(null);

  // Auto-rotation logic using requestAnimationFrame for smoothness
  const autoRotate = useCallback(() => {
    if (!isDraggingRef.current) {
      setRotation(prev => ({ ...prev, y: (prev.y + 0.05) % 360 }));
    }
    animationFrameId.current = requestAnimationFrame(autoRotate);
  }, []);

  useEffect(() => {
    animationFrameId.current = requestAnimationFrame(autoRotate);
    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [autoRotate]);

  // Mouse move handler for dragging
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingRef.current) return;
    const deltaX = e.clientX - prevMousePosRef.current.x;
    const deltaY = e.clientY - prevMousePosRef.current.y;

    setRotation(prev => {
      const newX = Math.max(-90, Math.min(90, prev.x - deltaY * 0.5)); // Clamp vertical rotation
      const newY = prev.y + deltaX * 0.5;
      return { x: newX, y: newY };
    });

    prevMousePosRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  // Mouse up handler to end dragging
  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    document.body.style.cursor = '';
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    
    // Restart auto-rotation smoothly
    if (!animationFrameId.current) {
        animationFrameId.current = requestAnimationFrame(autoRotate);
    }
  }, [handleMouseMove, autoRotate]);

  // Mouse down handler to start dragging
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    isDraggingRef.current = true;
    prevMousePosRef.current = { x: e.clientX, y: e.clientY };
    document.body.style.cursor = 'grabbing';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove, handleMouseUp]);
  
  return (
    <div className="flex items-center justify-center w-full h-full perspective-1000">
      <div
        className="relative w-[100px] h-[100px]"
        style={{
          transformStyle: 'preserve-3d',
          transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
          cursor: 'grab',
        }}
        onMouseDown={handleMouseDown}
        title="Clique e arraste para girar"
      >
        <div className="fidget-face front">★</div>
        <div className="fidget-face back">🚀</div>
        <div className="fidget-face right">🧠</div>
        <div className="fidget-face left">💪</div>
        <div className="fidget-face top">💯</div>
        <div className="fidget-face bottom">❤️</div>
      </div>
    </div>
  );
};

export default InteractiveWidget;
