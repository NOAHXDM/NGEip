import { Component, OnInit } from '@angular/core';
import { UserService } from '../services/user.service';
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
  email = 'example@gmail.com';
  phone = '0919094765';
  wfh_status = '4.5';
  job_title = 'qa';
  job_rank = 'J0';

  constructor(private userService: UserService) {}

  ngOnInit(): void {
    this.userService.currentUser$
      .pipe(
        tap((user) => {
          // 在這裡做賦值
          this.name = user.name;
        })
      )
      .subscribe();
  }
}
// example1
var user = {
  name: 'denny',
};

// example2
class User {
  name = 'denny';
}

const user1 = new User();

// example1 = example2
