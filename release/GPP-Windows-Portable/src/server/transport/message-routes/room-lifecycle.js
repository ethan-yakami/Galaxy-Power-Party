function createRoomLifecycleRoutes({ handlers, ERROR_CODES, send }) {
  return {
    create_room: {
      errorLabel: 'handleCreateRoom',
      run(ws, msg) {
        handlers.handleCreateRoom(ws, msg);
      },
    },
    create_ai_room: {
      errorLabel: 'handleCreateAIRoom',
      run(ws, msg) {
        handlers.handleCreateAIRoom(ws, msg);
      },
    },
    join_room: {
      errorLabel: 'handleJoinRoom',
      run(ws, msg) {
        handlers.handleJoinRoom(ws, msg);
      },
    },
    authenticate: {
      errorLabel: 'handleAuthenticate',
      run(ws, msg) {
        handlers.handleAuthenticate(ws, msg);
      },
    },
    leave_room: {
      errorLabel: 'leaveRoom',
      run(ws) {
        handlers.leaveRoom(ws, { reason: 'leave_room' });
        send(ws, { type: 'left_room' });
      },
    },
    resume_session: {
      errorLabel: 'handleResumeSession',
      run(ws, msg) {
        handlers.handleResumeSession(ws, msg);
      },
      onError(ws, envelope) {
        send(ws, {
          type: 'session_resume_failed',
          reason: 'server_error',
          code: ERROR_CODES.SESSION_RESUME_FAILED,
          message: 'Session resume failed.',
          meta: envelope.meta,
        });
      },
    },
    create_resume_room: {
      errorLabel: 'handleCreateResumeRoom',
      run(ws, msg) {
        handlers.handleCreateResumeRoom(ws, msg);
      },
    },
    play_again: {
      errorLabel: 'handlePlayAgain',
      run(ws) {
        handlers.handlePlayAgain(ws);
      },
    },
    disband_room: {
      errorLabel: 'handleDisbandRoom',
      run(ws) {
        handlers.handleDisbandRoom(ws);
      },
    },
  };
}

module.exports = createRoomLifecycleRoutes;
