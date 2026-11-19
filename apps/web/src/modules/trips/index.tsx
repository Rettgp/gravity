import { Route, Routes } from 'react-router-dom';
import '../../styles/trips.css';
import TripLayout from './TripLayout';
import TripList from './TripList';

export default function TripsModule() {
  return (
    <Routes>
      <Route index element={<TripList />} />
      <Route path=":tripId/*" element={<TripLayout />} />
    </Routes>
  );
}
