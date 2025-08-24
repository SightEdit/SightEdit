import { ref, computed, onMounted, onUnmounted } from 'vue';
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
  const { state } = useSightEdit();
  const collaborators = ref<Collaborator[]>([]);
  const isConnected = ref(false);
  const connectionError = ref<string | null>(null);

  const sendCursorPosition = (x: number, y: number) => {
    if (!state.instance) return;
    const collaboration = (state.instance as any).collaboration;
    if (collaboration?.sendCursorPosition) {
      collaboration.sendCursorPosition(x, y);
    }
  };

  const broadcastChange = (sight: string, value: any) => {
    if (!state.instance) return;
    const collaboration = (state.instance as any).collaboration;
    if (collaboration?.broadcastChange) {
      collaboration.broadcastChange(sight, value);
    }
  };

  onMounted(() => {
    if (!state.instance) return;

    const collaboration = (state.instance as any).collaboration;
    if (!collaboration) {
      console.warn('Collaboration not configured in SightEdit instance');
      return;
    }

    // Handle collaborator events
    const handleCollaboratorJoined = (data: any) => {
      collaborators.value.push({
        id: data.userId,
        name: data.userName,
        avatar: data.userAvatar,
        color: data.color || generateUserColor(data.userId)
      });
    };

    const handleCollaboratorLeft = (data: any) => {
      collaborators.value = collaborators.value.filter(c => c.id !== data.userId);
    };

    const handleCursorMove = (data: any) => {
      const collaborator = collaborators.value.find(c => c.id === data.userId);
      if (collaborator) {
        collaborator.cursor = { x: data.x, y: data.y };
      }
    };

    const handleConnectionChange = (connected: boolean) => {
      isConnected.value = connected;
      if (!connected) {
        connectionError.value = 'Connection lost. Attempting to reconnect...';
      } else {
        connectionError.value = null;
      }
    };

    // Subscribe to events
    state.instance.on('collaboratorJoined', handleCollaboratorJoined);
    state.instance.on('collaboratorLeft', handleCollaboratorLeft);
    state.instance.on('cursorMove', handleCursorMove);
    state.instance.on('collaborationConnected', () => handleConnectionChange(true));
    state.instance.on('collaborationDisconnected', () => handleConnectionChange(false));
    state.instance.on('collaborationError', (error: any) => {
      connectionError.value = error.message;
    });

    // Get initial collaborators
    if (collaboration.getCollaborators) {
      collaborators.value = collaboration.getCollaborators();
    }

    onUnmounted(() => {
      if (state.instance) {
        state.instance.off('collaboratorJoined', handleCollaboratorJoined);
        state.instance.off('collaboratorLeft', handleCollaboratorLeft);
        state.instance.off('cursorMove', handleCursorMove);
      }
    });
  });

  return {
    collaborators: computed(() => collaborators.value),
    isConnected: computed(() => isConnected.value),
    connectionError: computed(() => connectionError.value),
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