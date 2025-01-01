import { Pipe, PipeTransform } from '@angular/core';
import { Timestamp } from '@angular/fire/firestore';
import moment from 'moment';

@Pipe({
  name: 'firestoreTimestamp',
  standalone: true,
})
export class FirestoreTimestampPipe implements PipeTransform {
  transform(value: Timestamp): string {
    return moment(value.toDate()).format('YYYY-MM-DD dddd HH:mm:ss');
  }
}
