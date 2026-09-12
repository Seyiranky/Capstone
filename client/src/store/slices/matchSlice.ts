import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { matchApi } from '../../api/matchApi';
import type { Match } from '../../types';

interface MatchState {
  items: Match[];
  status: 'idle' | 'loading' | 'failed';
  error: string | null;
}

const initialState: MatchState = {
  items: [],
  status: 'idle',
  error: null,
};

export const fetchMatches = createAsyncThunk('matches/fetchAll', async () => matchApi.listMatches());

const matchSlice = createSlice({
  name: 'matches',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchMatches.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchMatches.fulfilled, (state, action) => {
        state.status = 'idle';
        state.items = action.payload;
      })
      .addCase(fetchMatches.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? 'Failed to load matches';
      });
  },
});

export default matchSlice.reducer;
