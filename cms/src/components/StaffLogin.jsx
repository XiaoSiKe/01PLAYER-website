import { redirect } from 'next/navigation';
import { formatAdminURL, getSafeRedirect } from 'payload/shared';
import StaffLoginForm from './StaffLoginForm';

export default function StaffLogin({ initPageResult, searchParams }) {
  const { req } = initPageResult;
  const { admin, routes } = req.payload.config;
  const redirectTo = getSafeRedirect({ fallbackTo: routes.admin, redirectTo: searchParams?.redirect });
  if (req.user) redirect(redirectTo);

  return (
    <div className="community-page community-page--account-access" data-staff-login="">
      <StaffLoginForm
        loginUrl={formatAdminURL({ apiRoute: routes.api, path: `/${admin.user}/login` })}
        helpUrl={formatAdminURL({ adminRoute: routes.admin, path: admin.routes.forgot })}
        redirectTo={redirectTo}
      />
    </div>
  );
}
