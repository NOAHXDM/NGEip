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
[![Ask DeepWiki][deepwiki-shield]][deepwiki-url]

## Overview

Enterprise Information Portal (EIP) is a comprehensive enterprise management system built with Angular 20 and Firebase. It provides a robust solution for managing employee attendance, leave management, subsidy applications, and user administration with full support for local development using Firebase Emulators.

## Features

- **User Management**

  - User registration and authentication (Firebase Auth with Google Sign-In support)
  - Role-based access control (Admin/User)
  - User profile management with Cloudinary avatar upload
  - User list display with filtering (hide resigned employees)
  - Visual indicators for resigned employees
  - Contact information and birthday privacy for resigned users

- **Attendance Management**

  - Attendance record creation and tracking with audit trails
  - Status management (Pending/Approved/Rejected)
  - Multiple attendance types support
  - Attendance statistics and reporting with date-based filtering
  - Dynamic filtering (daily, weekly, monthly, custom range)
  - Applicant filtering dialog
  - CSV export functionality
  - Action tracking with `actionBy` parameter for audit compliance

- **Leave Management**

  - Annual leave calculation based on service years
  - Leave balance tracking
  - Leave transaction history
  - Leave settlement functionality

- **Subsidy Management**

  - Employee subsidy application system (Phase 1, 2, and 3)
  - Multiple subsidy types (training courses, laptop, meal, etc.)
  - Subsidy application approval workflow
  - Laptop installment record management with custom amount input
  - Meal subsidy tracking and statistics
  - Comprehensive subsidy statistics with ranking leaderboard (Dialog-based)
  - Google Sheets import functionality for meal subsidy records
  - Improved Excel import logic for new format compatibility
  - Data migration tools for subsidy records (development and production support)
  - Firestore index optimization for enhanced query performance

- **System Configuration**

  - License management (max users, current users tracking)
  - Leave policy configuration (Taiwan Labor Standards Act compliant)
  - System preferences (initial settlement year, overtime priority)
  - Cloudinary image upload configuration
  - Timezone selection and handling
  - Custom date range options
  - Firebase Emulator support for local development

- **Data Export & Migration**

  - Attendance statistics export (CSV format)
  - Subsidy data migration tools (development and production support)

## Built With

- [![Angular][Angular.dev]][Angular-url]
- [![Firebase][Firebase.com]][Firebase-url]

#### Additional Technologies

- [Angular Material](https://material.angular.io/) - UI component library
- [Bootstrap 5](https://getbootstrap.com/) - CSS framework
- [Date-fns](https://date-fns.org/) - Date utility library with timezone support
- [Cloudinary](https://cloudinary.com/) - Image upload and management
- [Karma](https://karma-runner.github.io/) & [Jasmine](https://jasmine.github.io/) - Testing framework

<p></p>

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- npm (v9 or later)
- Angular CLI (v20 or later)
- Firebase account
- Firebase CLI (`npm install -g firebase-tools`)
- Cloudinary account (for avatar uploads)

### Installation

Clone the repository

```
git clone https://github.com/NOAHXDM/NGEip.git
cd NGEip
```

Install dependencies

```bash
 npm install
```

### Running the Development Server

Start the Firebase Emulators (Auth on port 9099, Firestore on port 8080)

```bash
npm start
```

This command will start the Firebase emulators for local development. The application will connect to:
- Firebase Auth Emulator: http://localhost:9099
- Firestore Emulator: http://localhost:8080

Additional commands:

```bash
npm run build      # Build for production (output to dist/angular-eip)
npm run watch      # Build in development mode with file watching
npm test           # Run Karma/Jasmine tests
npm run deploy     # Build and deploy to Firebase (uses firebase.prod.json)
```

## Architecture

### Environment Configuration

The application uses environment-based Firebase configuration:
- **Local Environment (firebase.local.json)**: Connects to Firebase Emulators (`environment.useEmulators: true`)
- **Production Environment (firebase.prod.json)**: Connects to live Firebase (`environment.useEmulators: false`)

Environment files are switched at build time using Angular's file replacement mechanism (see angular.json).

### Firebase Integration

- **Authentication**: Firebase Auth with emulator support
- **Database**: Firestore with collections: `users`, `attendanceLogs`, `attendanceStats`, `systemConfig`, `subsidyApplications`, `lunchSubsidies`
- **Hosting**: Static website deployed to Firebase Hosting (region: asia-east1)
- **Emulators**: Auth on port 9099, Firestore on port 8080

### Firestore Security Rules

Defined in `firestore.rules`:
- Admin role verified via Firestore query (not client claims)
- Users can read all data, update their own non-sensitive fields (cannot change role/email)
- Admins have full CRUD on users
- `systemConfig/license`: Open read/write, but updating maxUsers requires admin
- Attendance collections: Currently open read/write (recommended to tighten for production)

## Firebase Website Deployment Guide

### 1. **Create a Firebase Project**

- Go to the [Firebase Console](https://console.firebase.google.com/), click "Add project," and follow the instructions to complete the setup.

### 2. **Add Firebase to Your Web App**

- In the Firebase Console, add a new "Web App" and obtain the initialization code.

### 3. **Configure Firebase Environment Files**

- Create `firebase.prod.json` in the project root and insert your Firebase configuration:

```json
{
  "projectId": "your-project-id",
  "apiKey": "your-api-key",
  "authDomain": "your-project.firebaseapp.com",
  "storageBucket": "your-project.appspot.com",
  "messagingSenderId": "your-messaging-sender-id",
  "appId": "your-app-id"
}
```

- For local development, `firebase.local.json` is already configured to use emulators.

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

### 6. Enable Firebase Permissions

- Here are the steps to enable **Authentication**, **Hosting**, and **Firestore Database**:

#### Enable **Authentication**

- Go to the Firebase Console and select your project.
- In the left-hand menu, choose **Authentication** and click **Get Started**.
- Set up the sign-in methods, such as Email, Google, Facebook, etc., and enable the required sign-in methods.

#### Enable **Firestore Database**

- In the Firebase Console, select **Firestore Database** and click **Get Started**.
- Set the options for your database, choosing either **Test mode** or **Production mode**, depending on your needs.

#### Enable **Hosting**

- In the Firebase Console, select **Hosting** and click **Get Started**.
- Set the directory for your web deployment, selecting the `build/` or `dist/` folder, depending on the frontend framework you're using.
- Once enabled, run `firebase deploy` to deploy your website to Firebase Hosting.

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

Run the following command to build and deploy your website to Firebase:

```bash
npm run deploy
```

Or manually:

```bash
npm run build
firebase deploy --config firebase.prod.json
```

### 10. **Create Upload Preset in Cloudinary**

1. Log in to your Cloudinary account.
2. In the left sidebar, go to **Settings** → **Upload** tab.
3. In the Upload Presets section, select the default preset to edit its settings.

Configure the following options:

- **Upload preset name** : Copy this name and use it in your project configuration.
- **Upload folder** : Set the target folder to photos (or your desired folder path).
- **Generated public ID** : Select Auto-generate an unguessable public ID value. This ensures Cloudinary generates a unique and secure ID automatically
- **Generated display name** : Select Use the last segment of the public ID as the display name.

### 11. **Get Cloudinary Configuration Parameters**

In the left sidebar, go to **Settings** → **API Keys** tab.

Copy the following credentials:

1. **Cloud name** : Add this to your Cloudinary configuration.
2. **Upload preset name** : Use the name you created in Step 9.

### 12. **Set Environment Variables**

In your project root, update the .env file with the following content:

```
CLOUDINARY_URL=cloudinary://<your_api_key>:<your_api_secret>@dqbtn8sx3
```

Replace <your_api_key>,and <your_api_secret> with your actual Cloudinary credentials.

## Delete Unused Photos

Export a List of Public IDs in Use

- Download a list of all images currently in use in your project
  and save the contents of the JSON file to tools/eipImages.json.

Run the Cleanup Script :
In your terminal, run the following command

```
node tools/cloudinary-cleanup.js
```

- This script will compare the in-use public IDs (eipImages.json) with all existing public IDs from Cloudinary.
- It will identify and list the unused assets.
- When prompted, confirm deletion by typing y.

**Deletion Complete**

The script will delete all Cloudinary assets not included in the eipImages.json list.
This helps reduce storage usage and keeps your media library clean and organized.

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
[deepwiki-shield]: https://deepwiki.com/badge.svg
[deepwiki-url]: https://deepwiki.com/NOAHXDM/NGEip
