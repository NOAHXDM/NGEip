import { Component, HostListener } from '@angular/core';
import { MatGridListModule } from '@angular/material/grid-list';

import { AttendanceListComponent } from '../attendance/attendance-list/attendance-list.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [MatGridListModule, AttendanceListComponent],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent {
  gridTile1colspan = 3;
  gridTile2colspan = 1;

  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    const width = event.target.innerWidth;
    this.gridTile1colspan = width < 768 ? 4 : 3;
    this.gridTile2colspan = width < 768 ? 4 : 1;
    console.log(width);
  }
}
