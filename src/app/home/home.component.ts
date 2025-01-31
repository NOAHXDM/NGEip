import { AsyncPipe } from '@angular/common';
import { Component, HostListener, OnInit } from '@angular/core';
import { MatGridListModule } from '@angular/material/grid-list';
import { Observable } from 'rxjs';

import { AttendanceListComponent } from '../attendance/attendance-list/attendance-list.component';
import { User, UserService } from '../services/user.service';
import { UserCardComponent } from '../user-card/user-card.component';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    AsyncPipe,
    MatGridListModule,
    AttendanceListComponent,
    UserCardComponent,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
})
export class HomeComponent implements OnInit {
  gridTile1colspan = 3;
  gridTile2colspan = 1;
  readonly userList$: Observable<User[]>;

  constructor(private userService: UserService) {
    this.userList$ = this.userService.list$;
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
    this.gridTile1colspan = width < 768 ? 4 : 3;
    this.gridTile2colspan = width < 768 ? 4 : 1;
  }
}
