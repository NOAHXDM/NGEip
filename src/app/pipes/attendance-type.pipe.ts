import { Pipe, PipeTransform } from '@angular/core';
import { AttendanceService } from '../services/attendance.service';

@Pipe({
  name: 'attendanceType',
  standalone: true,
})
export class AttendanceTypePipe implements PipeTransform {
  constructor(private attendanceService: AttendanceService) {}

  transform(value: number): string {
    return (
      this.attendanceService.typeList.find((type) => type.value === value)
        ?.text || '-'
    );
  }
}
