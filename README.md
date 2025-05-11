<!-- Improved compatibility of back to top link: See: https://github.com/othneildrew/Best-README-Template/pull/73 -->

<a id="readme-top"></a>

<!--
*** Thanks for checking out the Best-README-Template. If you have a suggestion
*** that would make this better, please fork the repo and create a pull request
*** or simply open an issue with the tag "enhancement".
*** Don't forget to give the project a star!
*** Thanks again! Now go create something AMAZING! :D
-->

# Enterprise Information Portal (EIP)

[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]

## Overview

Enterprise Information Portal (EIP) is a comprehensive enterprise management system built with Angular and Firebase. It provides a robust solution for managing employee attendance, leave management, and user administration.

## Features

- **User Management**

  - User registration and authentication
  - Role-based access control (Admin/User)
  - User profile management
  - User list display

- **Attendance Management**

  - Attendance record creation and tracking
  - Status management (Pending/Approved/Rejected)
  - Multiple attendance types
  - Attendance statistics and reporting

- **Leave Management**

  - Annual leave calculation based on service years
  - Leave balance tracking
  - Leave transaction history
  - Leave settlement functionality

- **Remote Work Management**

  - Remote work eligibility settings
  - Remote work recommender system

- **System Configuration**

  - License management
  - Leave policy configuration
  - System preferences

- **Data Export**

  - Attendance statistics export (CSV format)

## Usage

1. **User Registration**

   - Navigate to the registration page
   - Fill in the required information
   - Submit the form

2. **Attendance Management**

   - Log in to the system
   - Navigate to the attendance section
   - Create new attendance records
   - Track attendance status

3. **Leave Management**

   - Access the leave management section
   - View leave balance
   - Request leave
   - Track leave history

4. **System Administration**
   - Log in as an administrator
   - Access system configuration
   - Manage users and permissions
   - Configure leave policies

## Built With

- [![Angular][Angular.dev]][Angular-url]
- [![Firebase][Firebase.com]][Firebase-url]

#### Additional Technologies

- [Angular Material](https://material.angular.io/) - UI component library
- [Bootstrap](https://getbootstrap.com/) - CSS framework
- [Date-fns](https://date-fns.org/) - Date utility library

<p></p>

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- npm (v9 or later)
- Angular CLI (v18 or later)
- Firebase account
- Firebase CLI (`npm install -g firebase-tools`)

### Installation

Clone the repository

```
git clone https://github.com/NOAHXDM/NGEip.git
cd NGEip
```

![Repository clone](./docs/repository_clone.gif)

Install dependencies

```bash
 npm install
```

![npm install](./docs/npm_install.gif)

### Running the Development Server

Start the development server

```bash
npm start
```

## Firebase Website Deployment Guide

### 1. **Create a Firebase Project**

- Go to the [Firebase Console](https://console.firebase.google.com/), click "Add project," and follow the instructions to complete the setup.

### 2. **Add Firebase to Your Web App**

- In the Firebase Console, add a new "Web App" and obtain the initialization code.

### 3. **Paste the Firebase Initialization Code**

- Insert the provided Firebase code into your project.

```
// app.config.ts
export const appConfig = {
  production: false,
  firebase: {
    apiKey: "your-api-key",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project-id",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "your-messaging-sender-id",
    appId: "your-app-id",
  },
};
```

![Create a new firebase project](./steps.gif/create_firebase_project.gif)

### 4. **Install Firebase CLI**

```bash
npm install -g firebase-tools
```

### 5. **Configure `.firebaserc`**

Make sure there is a `.firebaserc` file in the root directory of your project, and set your Firebase project ID:

```
{
  "projects": {
    "default": "your-project-id"
  }
}
```

![Modify .firebaserc](./steps.gif/firebase_init.gif)

### 6. Enable Firebase Permissions

- Here are the steps to enable **Authentication**, **Hosting**, and **Firestore Database**:

#### Enable **Authentication**

- Go to the Firebase Console and select your project.
- In the left-hand menu, choose **Authentication** and click **Get Started**.
- Set up the sign-in methods, such as Email, Google, Facebook, etc., and enable the required sign-in methods.

#### Enable **Firestore Database**

- In the Firebase Console, select **Firestore Database** and click **Get Started**.
- Set the options for your database, choosing either **Test mode** or **Production mode**, depending on your needs.
  ![Enable firebase service](./steps.gif/enable_firebase_service.gif)

#### Enable **Hosting**

- In the Firebase Console, select **Hosting** and click **Get Started**.
- Set the directory for your web deployment, selecting the `build/` or `dist/` folder, depending on the frontend framework you're using.
- Once enabled, run `firebase deploy` to deploy your website to Firebase Hosting.
  ![Enable hosting](./steps.gif/enable_hosting.gif)

### 7. **Log in to Firebase**

Use the following command to log in to your Firebase account and authorize Firebase CLI permissions:

```
firebase login
```

### 8. **Create a Production Build**

Depending on your frontend framework (such as React, Vue, Angular, etc.), run the following command to generate the static files:

```
npm run build
```

### 9. **Deploy to Firebase Hosting**

Run the following command to deploy your website to Firebase:

```
firebase deploy
```

![firebase deploy](./steps.gif/firebase_deploy.gif)

## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are greatly appreciated.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

Distributed under the MIT License. See `LICENSE.txt` for more information.

## Acknowledgments

- [Angular Material](https://material.angular.io/) for the UI components
- [Firebase](https://firebase.google.com/) for the backend services
- [Bootstrap](https://getbootstrap.com/) for the responsive design
- [Date-fns](https://date-fns.org/) for date manipulation utilities
- [Img Shields](https://shields.io)

## Contributors

<a href="https://github.com/NOAHXDM/NGEip/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=NOAHXDM/NGEip" alt="contrib.rocks image" />
</a>

<p align="right">(<a href="#readme-top">back to top</a>)</p>

<!-- MARKDOWN LINKS & IMAGES -->

[contributors-shield]: https://img.shields.io/github/contributors/NOAHXDM/NGEip.svg?style=for-the-badge
[contributors-url]: https://github.com/NOAHXDM/NGEip/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/NOAHXDM/NGEip.svg?style=for-the-badge
[forks-url]: https://github.com/NOAHXDM/NGEip/network/members
[stars-shield]: https://img.shields.io/github/stars/NOAHXDM/NGEip.svg?style=for-the-badge
[stars-url]: https://github.com/NOAHXDM/NGEip/stargazers
[issues-shield]: https://img.shields.io/github/issues/NOAHXDM/NGEip.svg?style=for-the-badge
[issues-url]: https://github.com/NOAHXDM/NGEip/issues
[license-shield]: https://img.shields.io/github/license/NOAHXDM/NGEip.svg?style=for-the-badge
[license-url]: https://github.com/NOAHXDM/NGEip/blob/master/LICENSE.txt
[Angular.dev]: https://img.shields.io/badge/Angular-DD0031?style=for-the-badge&logo=angular&logoColor=white
[Angular-url]: https://angular.dev
[Firebase.com]: https://img.shields.io/badge/firebase-ffca28?style=for-the-badge&logo=firebase&logoColor=black
[Firebase-url]: https://firebase.google.com/
