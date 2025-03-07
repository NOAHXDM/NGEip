import { AsyncPipe } from '@angular/common';
import { Component, HostListener, OnInit } from '@angular/core';
import { MatGridListModule } from '@angular/material/grid-list';
import { map, Observable } from 'rxjs';

import { AttendanceListComponent } from '../attendance/attendance-list/attendance-list.component';
import { AttendanceStatsComponent } from '../attendance/attendance-stats/attendance-stats.component';
import { User, UserService } from '../services/user.service';
import { UserCardEasyComponent } from '../user-card-easy/user-card-easy.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    AsyncPipe,
    MatGridListModule,
    AttendanceListComponent,
    AttendanceStatsComponent,
    UserCardEasyComponent,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  gridTile1colspan = 3;
  gridTile2colspan = 1;
  readonly userList$: Observable<User[]>;

  constructor(private userService: UserService) {
    this.userList$ = this.userService.list$.pipe(
      map((users) => users.filter((user) => !user.exitDate))
    );
  }
  ngOnInit() {
    this.updateGridTileColspan(window.innerWidth);
  }

  @HostListener('window:resize', ['$event'])
  onResize(event: any) {
    const width = event.target.innerWidth;
    this.updateGridTileColspan(width);
  }

  private updateGridTileColspan(width: number) {
    this.gridTile1colspan = width < 1200 ? 4 : 3;
    this.gridTile2colspan = width < 1200 ? 4 : 1;
  }
}
