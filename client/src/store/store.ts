import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import gigReducer from './slices/gigSlice';
import matchReducer from './slices/matchSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    gigs: gigReducer,
    matches: matchReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
