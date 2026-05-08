import { useEffect, useRef } from 'react';

interface VisualizerProps {
  isTransmitting: boolean;
  color?: string;
}

export default function Visualizer({ isTransmitting, color = '#ff8800' }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    const bars = 20;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      for (let i = 0; i < bars; i++) {
        const height = isTransmitting 
          ? Math.random() * canvas.height * 0.8 + 2
          : Math.random() * 2 + 1;
          
        ctx.fillStyle = isTransmitting ? color : '#333333';
        ctx.shadowBlur = isTransmitting ? 5 : 0;
        ctx.shadowColor = color;
        
        ctx.fillRect(
          i * (canvas.width / bars), 
          canvas.height - height, 
          (canvas.width / bars) - 2, 
          height
        );
      }
      
      animationId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationId);
  }, [isTransmitting, color]);

  return (
    <canvas 
      ref={canvasRef} 
      width={200} 
      height={40} 
      className="w-full h-10 opacity-80"
    />
  );
}
