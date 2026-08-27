import React, { createContext, useContext } from 'react';
import { DatabaseProvider as WatermelonProvider } from '@nozbe/watermelondb/DatabaseProvider';
import { database } from './index';

const DatabaseContext = createContext(database);

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  return (
    <WatermelonProvider database={database}>
      {children}
    </WatermelonProvider>
  );
}

export function useDatabase() {
  return useContext(DatabaseContext);
}
