import { inject, Injectable } from '@angular/core';
import { Timestamp } from '@angular/fire/firestore';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';

import { ClientPreferencesService } from './client-preferences.service';

const TIMEZONEMAPPING: { [key: string]: string } = {
  '-12': 'Etc/GMT+12',
  '-11': 'Pacific/Midway',
  '-10': 'Pacific/Honolulu',
  '-9': 'America/Anchorage',
  '-8': 'America/Los_Angeles',
  '-7': 'America/Denver',
  '-6': 'America/Chicago',
  '-5': 'America/New_York',
  '-4': 'America/Santiago',
  '-3': 'America/Argentina/Buenos_Aires',
  '-2': 'Atlantic/South_Georgia',
  '-1': 'Atlantic/Azores',
  '0': 'Europe/London',
  '1': 'Europe/Paris',
  '2': 'Europe/Athens',
  '3': 'Europe/Moscow',
  '4': 'Asia/Dubai',
  '5': 'Asia/Karachi',
  '6': 'Asia/Dhaka',
  '7': 'Asia/Bangkok',
  '8': 'Asia/Taipei',
  '9': 'Asia/Tokyo',
  '10': 'Australia/Sydney',
  '11': 'Pacific/Noumea',
  '12': 'Pacific/Auckland',
  '13': 'Pacific/Tongatapu',
  '14': 'Pacific/Kiritimati',
};

@Injectable({
  providedIn: 'root',
})
export class TimezoneService {
  clientPreferencesService = inject(ClientPreferencesService);
  clientTimezone: string = '';

  constructor() {}

  getTimezoneOptions(): TimezoneOption[] {
    const options: TimezoneOption[] = [];
    for (let i = -12; i <= 14; i++) {
      const value = TIMEZONEMAPPING[i];
      const label = `GMT${i >= 0 ? '+' : ''}${i} ${value}`;
      const offset = -i * 60;
      options.push({ label, offset, value });
    }

    return options;
  }

  getCurrentTimezoneOption(): TimezoneOption {
    const clientTimezone: string | undefined =
      this.clientPreferencesService.getPreference('clientTimezone');
    if (clientTimezone) {
      this.clientTimezone = clientTimezone!;
    } else {
      this.setClientTimezone(new Date().getTimezoneOffset());
    }

    const timezoneOption = this.getTimezoneOptions().find(
      (option) => option.value === this.clientTimezone
    );
    return timezoneOption!;
  }

  setClientTimezone(offset: number) {
    const hours = -offset / 60;
    this.clientTimezone = TIMEZONEMAPPING[hours];
    this.clientPreferencesService.setPreference(
      'clientTimezone',
      this.clientTimezone
    );
  }

  convertDateByClientTimezone(timestamp: Timestamp): Date {
    const date = timestamp.toDate();
    const adjustedDate = toZonedTime(date, this.clientTimezone);
    return adjustedDate;
  }

  convertTimestampByClientTimezone(date: Date): Timestamp {
    return Timestamp.fromDate(fromZonedTime(date, this.clientTimezone));
  }
}

interface TimezoneOption {
  label: string;
  value: string;
  offset: number;
}
