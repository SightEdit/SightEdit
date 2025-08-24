import { useEffect, useState, useCallback } from 'react';
import { useSightEdit } from '../index';

export interface Collaborator {
  id: string;
  name: string;
  avatar?: string;
  cursor?: { x: number; y: number };
  color: string;
}

export interface UseCollaborationOptions {
  roomId: string;
  userId: string;
  userName: string;
  userAvatar?: string;
}

export function useCollaboration(options: UseCollaborationOptions) {
  const { instance } = useSightEdit();
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  useEffect(() => {
    if (!instance) return;

    // Initialize collaboration if not already done
    const collaboration = (instance as any).collaboration;
    if (!collaboration) {
      console.warn('Collaboration not configured in SightEdit instance');
      return;
    }

    // Handle collaborator events
    const handleCollaboratorJoined = (data: any) => {
      setCollaborators(prev => [...prev, {
        id: data.userId,
        name: data.userName,
        avatar: data.userAvatar,
        color: data.color || generateUserColor(data.userId)
      }]);
    };

    const handleCollaboratorLeft = (data: any) => {
      setCollaborators(prev => prev.filter(c => c.id !== data.userId));
    };

    const handleCursorMove = (data: any) => {
      setCollaborators(prev => prev.map(c => 
        c.id === data.userId 
          ? { ...c, cursor: { x: data.x, y: data.y } }
          : c
      ));
    };

    const handleConnectionChange = (connected: boolean) => {
      setIsConnected(connected);
      if (!connected) {
        setConnectionError('Connection lost. Attempting to reconnect...');
      } else {
        setConnectionError(null);
      }
    };

    // Subscribe to events
    instance.on('collaboratorJoined', handleCollaboratorJoined);
    instance.on('collaboratorLeft', handleCollaboratorLeft);
    instance.on('cursorMove', handleCursorMove);
    instance.on('collaborationConnected', () => handleConnectionChange(true));
    instance.on('collaborationDisconnected', () => handleConnectionChange(false));
    instance.on('collaborationError', (error: any) => setConnectionError(error.message));

    // Get initial collaborators
    if (collaboration.getCollaborators) {
      setCollaborators(collaboration.getCollaborators());
    }

    return () => {
      instance.off('collaboratorJoined', handleCollaboratorJoined);
      instance.off('collaboratorLeft', handleCollaboratorLeft);
      instance.off('cursorMove', handleCursorMove);
      instance.off('collaborationConnected', () => handleConnectionChange(true));
      instance.off('collaborationDisconnected', () => handleConnectionChange(false));
    };
  }, [instance, options]);

  const sendCursorPosition = useCallback((x: number, y: number) => {
    if (!instance) return;
    const collaboration = (instance as any).collaboration;
    if (collaboration?.sendCursorPosition) {
      collaboration.sendCursorPosition(x, y);
    }
  }, [instance]);

  const broadcastChange = useCallback((sight: string, value: any) => {
    if (!instance) return;
    const collaboration = (instance as any).collaboration;
    if (collaboration?.broadcastChange) {
      collaboration.broadcastChange(sight, value);
    }
  }, [instance]);

  return {
    collaborators,
    isConnected,
    connectionError,
    sendCursorPosition,
    broadcastChange
  };
}

function generateUserColor(userId: string): string {
  const colors = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', 
    '#FFEAA7', '#DDA0DD', '#98D8C8', '#FFD93D'
  ];
  
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  return colors[Math.abs(hash) % colors.length];
}