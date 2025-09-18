
import { useState, useEffect } from 'react';

const useTime = () => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const getGreeting = () => {
    const hour = now.getHours();
    if (hour >= 6 && hour < 12) {
      return 'BOM DIA, GOSTOSA!';
    } else if (hour >= 12 && hour < 18) {
      return 'BOA TARDE, GOSTOSA! VAMOS PRO ROUND 2?';
    } else {
      return 'BOA NOITE, GOSTOSA! LEMBRE-SE DE DESCANSAR.';
    }
  };

  const timeString = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dateString = now.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return { greeting: getGreeting(), timeString, dateString };
};

export default useTime;
