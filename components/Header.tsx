import React from 'react';
import useTime from '../hooks/useTime';

const Header: React.FC = () => {
  const { timeString, dateString } = useTime();

  return (
    <header className="text-center pt-8 pb-4">
      <div className="text-lg text-gray-400">
        <span className="font-mono">{timeString}</span> &bull; <span>{dateString}</span>
      </div>
    </header>
  );
};

export default Header;