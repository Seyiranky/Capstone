import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { isAxiosError } from 'axios';
import { authApi, type AuthResponse, type GoogleLoginResponse } from '../../api/authApi';
import { userApi } from '../../api/userApi';
import type { Role, User } from '../../types';

const extractErrorMessage = (err: unknown, fallback: string): string => {
  if (isAxiosError(err) && typeof err.response?.data?.message === 'string') {
    return err.response.data.message;
  }
  return fallback;
};

interface AuthState {
  userId: string | null;
  role: Role | null;
  token: string | null;
  profile: User | null;
  status: 'idle' | 'loading' | 'failed';
  error: string | null;
}

const initialState: AuthState = {
  userId: null,
  role: null,
  token: localStorage.getItem('token'),
  profile: null,
  status: 'idle',
  error: null,
};

export const login = createAsyncThunk(
  'auth/login',
  async (payload: { email: string; password: string }, { rejectWithValue }) => {
    try {
      return await authApi.login(payload);
    } catch (err) {
      return rejectWithValue(extractErrorMessage(err, 'Login failed'));
    }
  },
);

export const register = createAsyncThunk(
  'auth/register',
  async (
    payload: { name: string; email: string; password: string; role: Role },
    { rejectWithValue },
  ) => {
    try {
      return await authApi.register(payload);
    } catch (err) {
      return rejectWithValue(extractErrorMessage(err, 'Registration failed'));
    }
  },
);

export const googleLogin = createAsyncThunk(
  'auth/googleLogin',
  async (payload: { credential: string; role?: Role }, { rejectWithValue }) => {
    try {
      return await authApi.googleLogin(payload);
    } catch (err) {
      return rejectWithValue(extractErrorMessage(err, 'Google sign-in failed'));
    }
  },
);

export const fetchCurrentUser = createAsyncThunk(
  'auth/fetchCurrentUser',
  async (_: void, { rejectWithValue }) => {
    try {
      return await userApi.getProfile();
    } catch (err) {
      return rejectWithValue(extractErrorMessage(err, 'Failed to load profile'));
    }
  },
);

const applyAuthResponse = (state: AuthState, action: PayloadAction<AuthResponse>) => {
  state.status = 'idle';
  state.userId = action.payload.userId;
  state.role = action.payload.role;
  state.token = action.payload.token;
  localStorage.setItem('token', action.payload.token);
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout: (state) => {
      state.userId = null;
      state.role = null;
      state.token = null;
      state.profile = null;
      localStorage.removeItem('token');
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(login.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(login.fulfilled, applyAuthResponse)
      .addCase(login.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) ?? 'Login failed';
      })
      .addCase(register.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(register.fulfilled, applyAuthResponse)
      .addCase(register.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) ?? 'Registration failed';
      })
      .addCase(googleLogin.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(googleLogin.fulfilled, (state, action: PayloadAction<GoogleLoginResponse>) => {
        if ('token' in action.payload) {
          applyAuthResponse(state, action as PayloadAction<AuthResponse>);
        } else {
          state.status = 'idle';
        }
      })
      .addCase(googleLogin.rejected, (state, action) => {
        state.status = 'failed';
        state.error = (action.payload as string) ?? 'Google sign-in failed';
      })
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.profile = action.payload;
        state.userId = action.payload.id;
        state.role = action.payload.role;
      })
      .addCase(fetchCurrentUser.rejected, (state) => {
        state.userId = null;
        state.role = null;
        state.token = null;
        state.profile = null;
        localStorage.removeItem('token');
      });
  },
});

export const { logout } = authSlice.actions;
export default authSlice.reducer;
