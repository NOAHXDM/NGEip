import { Component, OnInit } from '@angular/core';
import { UserService, User } from '../services/user.service';
import { tap } from 'rxjs';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-avatar',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './avatar.component.html',
  styleUrl: './avatar.component.scss',
})
export class AvatarComponent implements OnInit {
  name = 'example';

  wfh_status = '4.5';
  job_title = 'qa';
  job_rank = 'J0';
  user?: User;
  email?: User;
  phone?: User;
  remoteWorkEligibility?: User;

  constructor(private userService: UserService) {}

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
        })
      )
      .subscribe();
  }
}
// // example1
// var user = {
//   name: 'denny',
// };

// // example2
// class User {
//   name = 'denny';
// }

// const user1 = new User();

// // example1 = example2
