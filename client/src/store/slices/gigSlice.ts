import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { gigApi } from '../../api/gigApi';
import type { Gig } from '../../types';

interface GigState {
  items: Gig[];
  status: 'idle' | 'loading' | 'failed';
  error: string | null;
}

const initialState: GigState = {
  items: [],
  status: 'idle',
  error: null,
};

export const fetchGigs = createAsyncThunk('gigs/fetchAll', async () => gigApi.listGigs());

const gigSlice = createSlice({
  name: 'gigs',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchGigs.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchGigs.fulfilled, (state, action) => {
        state.status = 'idle';
        state.items = action.payload;
      })
      .addCase(fetchGigs.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message ?? 'Failed to load gigs';
      });
  },
});

export default gigSlice.reducer;
