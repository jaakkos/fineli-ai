interface CardProps {
  header?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export default function Card({ header, children, className = '' }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white ${className}`}
    >
      {header && (
        <div className="border-b border-gray-200 px-4 py-3 font-medium text-gray-900">
          {header}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}
