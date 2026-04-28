"use client";

interface ProfileSectionTab {
  id: string;
  label: string;
}

interface ProfileSectionTabsProps {
  tabs: ProfileSectionTab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  className?: string;
}

export function ProfileSectionTabs({
  tabs,
  activeTab,
  onChange,
  className,
}: ProfileSectionTabsProps) {
  return (
    <div className={`dg-span-tabs dg-span-tabs--light w-full sm:w-auto ${className ?? ""}`.trim()}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={`dg-span-tab${activeTab === tab.id ? " active" : ""}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
