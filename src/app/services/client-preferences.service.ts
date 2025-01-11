import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ClientPreferencesService {
  private storageKey = 'PREFERENCES';

  constructor() {}

  getPreference(key: keyof Preferences) {
    const preferences = this.getPreferences();
    return preferences ? preferences[key] : null;
  }

  setPreference(key: keyof Preferences, value: any) {
    const preferences = this.getPreferences();
    preferences[key] = value;
    localStorage.setItem(this.storageKey, JSON.stringify(preferences));
  }

  clearPreference(key: keyof Preferences) {
    const preferences = this.getPreferences();
    delete preferences[key];
    localStorage.setItem(this.storageKey, JSON.stringify(preferences));
  }

  clearAllPreferences() {
    localStorage.removeItem(this.storageKey);
  }

  private getPreferences() {
    const data = localStorage.getItem(this.storageKey);
    return data ? (JSON.parse(data) as Preferences) : {};
  }
}

interface Preferences {
  logsSearchOption?: string;
}
