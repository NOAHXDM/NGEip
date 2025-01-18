import { AsyncPipe } from '@angular/common';
import { Component, Input } from '@angular/core';
import { Observable } from 'rxjs';

import { User, UserService } from '../services/user.service';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { UserProfileComponent } from '../user-profile/user-profile.component';
import { MatIconModule } from '@angular/material/icon';
import { tap } from 'rxjs';
import { AvatarComponent } from '../avatar/avatar.component';

@Component({
  selector: 'app-user-card',
  standalone: true,
  imports: [AsyncPipe, MatDialogModule, MatIconModule, AvatarComponent],
  templateUrl: './user-card.component.html',
  styleUrl: './user-card.component.scss',
})
export class UserCardComponent {
  @Input() user!: User;
  readonly isAdmin$: Observable<boolean>;

  constructor(private userService: UserService, private _dialog: MatDialog) {
    this.isAdmin$ = this.userService.isAdmin$;
  }

  openUserProfileDialog() {
    const dialogRef = this._dialog.open(UserProfileComponent, {
      data: { user: this.user },
      width: '65vw',
    });
  }
  name = 'example';

  // user?: User;
  email?: User;
  phone?: User;
  remoteWorkEligibility?: User;
  jobRank?: User;
  jobTitle?: User;
  remainingLeaveHours?: User;

  // constructor(private userService: UserService) {}

  ngOnInit(): void {
    this.userService.currentUser$
      .pipe(
        tap((user) => {
          // 在這裡做賦值
          this.name = user.name;
          this.user = user;
          this.email = user;
          this.phone = user;
          this.remoteWorkEligibility = user;
          this.jobRank = user;
          this.jobTitle = user;
          this.remainingLeaveHours = user;
        })
      )
      .subscribe();
  }
}
