import { Component } from '@angular/core';
import { MatGridListModule } from '@angular/material/grid-list';

import { AttendanceListComponent } from '../attendance/attendance-list/attendance-list.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [MatGridListModule, AttendanceListComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {}
