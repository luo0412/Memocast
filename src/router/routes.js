
const routes = [
  {
    path: '/',
    component: () => import('components/MainLayout.vue'),
    children: [
      { path: '', component: () => import('pages/Index.vue') }
    ]
  }
]

export default routes
