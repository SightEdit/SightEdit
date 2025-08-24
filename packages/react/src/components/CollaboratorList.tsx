import React from 'react';
import { useCollaboration } from '../hooks/useCollaboration';

export interface CollaboratorListProps {
  className?: string;
  style?: React.CSSProperties;
  showCursors?: boolean;
  maxDisplay?: number;
  roomId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
}

export const CollaboratorList: React.FC<CollaboratorListProps> = ({
  className,
  style,
  showCursors = true,
  maxDisplay = 5,
  roomId,
  userId,
  userName,
  userAvatar
}) => {
  const { 
    collaborators, 
    isConnected, 
    connectionError 
  } = useCollaboration({
    roomId,
    userId,
    userName,
    userAvatar
  });

  if (!isConnected && connectionError) {
    return (
      <div 
        className={`sightedit-collaborators-error ${className || ''}`}
        style={{
          padding: '8px 12px',
          background: '#fff3cd',
          border: '1px solid #ffc107',
          borderRadius: '4px',
          fontSize: '12px',
          color: '#856404',
          ...style
        }}
      >
        ⚠️ {connectionError}
      </div>
    );
  }

  const displayCollaborators = collaborators.slice(0, maxDisplay);
  const hiddenCount = Math.max(0, collaborators.length - maxDisplay);

  return (
    <div 
      className={`sightedit-collaborators ${className || ''}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '8px',
        ...style
      }}
    >
      <span style={{ fontSize: '12px', color: '#666', marginRight: '8px' }}>
        {isConnected ? '🟢' : '🔴'} {collaborators.length + 1} active
      </span>

      <div style={{ display: 'flex', alignItems: 'center' }}>
        {displayCollaborators.map((collaborator, index) => (
          <div
            key={collaborator.id}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: collaborator.color,
              border: '2px solid white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              fontWeight: 'bold',
              color: 'white',
              marginLeft: index > 0 ? '-8px' : 0,
              position: 'relative',
              zIndex: maxDisplay - index,
              cursor: 'pointer',
              transition: 'transform 0.2s'
            }}
            title={collaborator.name}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.1)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            {collaborator.avatar ? (
              <img 
                src={collaborator.avatar} 
                alt={collaborator.name}
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: '50%',
                  objectFit: 'cover'
                }}
              />
            ) : (
              collaborator.name.charAt(0).toUpperCase()
            )}
          </div>
        ))}

        {hiddenCount > 0 && (
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: '#9e9e9e',
              border: '2px solid white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px',
              color: 'white',
              marginLeft: '-8px',
              position: 'relative',
              zIndex: 0
            }}
            title={`${hiddenCount} more collaborators`}
          >
            +{hiddenCount}
          </div>
        )}
      </div>

      {showCursors && (
        <>
          {collaborators.map(collaborator => 
            collaborator.cursor && (
              <div
                key={`cursor-${collaborator.id}`}
                style={{
                  position: 'fixed',
                  left: collaborator.cursor.x,
                  top: collaborator.cursor.y,
                  width: '20px',
                  height: '20px',
                  pointerEvents: 'none',
                  zIndex: 10000,
                  transition: 'all 0.1s ease-out'
                }}
              >
                <svg width="20" height="20" viewBox="0 0 20 20">
                  <path
                    d="M0 0 L12 12 L7 12 L7 18 L5 18 L5 12 L0 12 Z"
                    fill={collaborator.color}
                    stroke="white"
                    strokeWidth="1"
                  />
                </svg>
                <div
                  style={{
                    position: 'absolute',
                    top: '20px',
                    left: '10px',
                    background: collaborator.color,
                    color: 'white',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontSize: '11px',
                    whiteSpace: 'nowrap',
                    fontWeight: 500
                  }}
                >
                  {collaborator.name}
                </div>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
};