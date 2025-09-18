
import React from 'react';
import { Tab } from '../types';

interface TabsProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}

const Tabs: React.FC<TabsProps> = ({ activeTab, setActiveTab }) => {
  // Fix: Add type assertion to ensure `tabs` is of type `Tab[]`
  const tabs = Object.values(Tab) as Tab[];

  return (
    <nav className="flex justify-center items-center border-b border-gray-700 mb-8">
      {tabs.map((tab) => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          className={`px-6 py-3 text-lg font-semibold transition-colors duration-300 focus:outline-none ${
            activeTab === tab
              ? 'text-indigo-400 border-b-2 border-indigo-400'
              : 'text-gray-400 hover:text-indigo-300'
          }`}
        >
          {tab}
        </button>
      ))}
    </nav>
  );
};

export default Tabs;